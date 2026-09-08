import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaterSamplePoints } from '../frontend/worlds/shared/engine/water.js';
import { WATERS as AIZANOI_WATERS } from '../frontend/worlds/aizanoi-225/js/city-data.js';
import { WATERS as ATHENS_WATERS } from '../frontend/worlds/athens-450-430/js/city-data.js';
import { WATERS as ROME_WATERS } from '../frontend/worlds/rome-410-476/js/city-data.js';

test('Living water: buildWaterSamplePoints generates dense river audio coverage <= 25m', () => {
  // Aizanoi Penkalas
  const aizanoiPts = buildWaterSamplePoints(AIZANOI_WATERS, 25);
  assert.ok(aizanoiPts.length >= 40, `Aizanoi water sample points too sparse: ${aizanoiPts.length}`);
  for (let i = 0; i < aizanoiPts.length - 1; i++) {
    const d = Math.hypot(aizanoiPts[i + 1].x - aizanoiPts[i].x, aizanoiPts[i + 1].z - aizanoiPts[i].z);
    assert.ok(d <= 25.5, `Aizanoi gap between sample points ${i} and ${i + 1} exceeds 25m: ${d}`);
  }

  // Rome Tiber
  const romePts = buildWaterSamplePoints(ROME_WATERS, 25);
  assert.ok(romePts.length >= 50, `Rome water sample points too sparse: ${romePts.length}`);
  for (let i = 0; i < romePts.length - 1; i++) {
    const d = Math.hypot(romePts[i + 1].x - romePts[i].x, romePts[i + 1].z - romePts[i].z);
    assert.ok(d <= 25.5, `Rome gap between sample points ${i} and ${i + 1} exceeds 25m: ${d}`);
  }

  // Athens Ilissos, Eridanos, Kallirrhoe spring
  const athensPts = buildWaterSamplePoints(ATHENS_WATERS, 25);
  assert.ok(athensPts.length >= 25, `Athens water sample points too sparse: ${athensPts.length}`);
  const springPt = athensPts.find(p => Math.hypot(p.x - (-260), p.z - 160) < 1.0);
  assert.ok(springPt, 'Kallirrhoe spring must be included in Athens water sample points');
});

test('Aircraft movement: modern airliner includes ICAO navigation & strobe lights', async () => {
  const { buildModernAirliner } = await import('../frontend/worlds/shared/assets/props.js');
  const airliner = buildModernAirliner(0, 0, 0);

  assert.ok(airliner, 'Airliner group must be created');
  assert.equal(typeof airliner.userData.updateLights, 'function', 'Airliner must have updateLights function');

  // Find light points in group hierarchy
  const lightNames = [];
  airliner.traverse(child => {
    if (child.name) lightNames.push(child.name);
  });

  assert.ok(lightNames.includes('nav-red-port'), 'Must include port red nav light');
  assert.ok(lightNames.includes('nav-green-starboard'), 'Must include starboard green nav light');
  assert.ok(lightNames.includes('nav-white-tail'), 'Must include tail white nav light');
  assert.ok(lightNames.includes('strobe-left-wing'), 'Must include left wing strobe');
  assert.ok(lightNames.includes('strobe-right-wing'), 'Must include right wing strobe');
  assert.ok(lightNames.includes('beacon-top'), 'Must include fuselage beacon');
});

test('Aircraft movement: AirportTrafficSystem advances pushback, taxi, takeoff and landing cycles', async () => {
  const THREE = await import('../frontend/worlds/shared/vendor/three.module.js');
  const { AirportTrafficSystem } = await import('../frontend/worlds/iga-airport/js/aircraft.js');

  const scene = new THREE.Scene();
  let collisionChecked = 0;
  const mockCollision = {
    _checkCollision: () => {
      collisionChecked++;
      return null;
    }
  };

  const traffic = new AirportTrafficSystem(scene, mockCollision);
  traffic.init();

  assert.ok(traffic.pushbackState, 'Must initialize pushback state');
  assert.ok(traffic.taxiState, 'Must initialize taxi state');
  assert.ok(traffic.takeoffState, 'Must initialize takeoff state');
  assert.ok(traffic.landingState, 'Must initialize landing state');

  const initialTakeoffZ = traffic.takeoffState.airliner.position.z;
  const initialTaxiDist = traffic.taxiState.dist || 0;

  // Simulate 10 seconds of airport operations
  const playerPos = new THREE.Vector3(-650, 1.7, 300); // Player standing on runway near takeoff start
  for (let step = 0; step < 100; step++) {
    traffic.update(0.1, false, playerPos);
  }

  // Verify taxiing airliner moved
  assert.ok(traffic.taxiState.dist > initialTaxiDist, 'Taxiing airliner should advance along waypoints');

  // Verify takeoff airliner rolled down runway
  assert.ok(traffic.takeoffState.airliner.position.z > initialTakeoffZ, 'Takeoff airliner should roll along runway');

  // Verify soft player clearance check was invoked to keep runway walk-safe
  assert.ok(collisionChecked > 0, 'Should check static collision to avoid pushing player through geometry');
});

test('Rome decay: verdigris bronze statuary, charred insulae, collapsed arcade and rubble props', async () => {
  const {
    buildStatueMonument,
    buildFallenColumnDrums,
    buildShatteredStele,
    buildDebrisPile,
    buildPavingWeeds,
  } = await import('../frontend/worlds/shared/assets/props.js');
  const { createCharredInsula, buildCollapsedArcade } = await import('../frontend/worlds/rome-410-476/js/builders.js');
  const { getEvidenceMaterial, getMaterial } = await import('../frontend/worlds/shared/assets/materials.js');

  // 1. Verdigris statue
  const freshStatue = buildStatueMonument(0, 0, 0, false, false);
  const decayedStatue = buildStatueMonument(0, 0, 0, false, true);
  assert.ok(decayedStatue, 'Decayed statue group created');
  const verdigrisMat = getMaterial('verdigrisBronze');
  assert.equal(verdigrisMat.color.getHex(), 0x42735d, 'Verdigris bronze color must be 0x42735d');

  // 2. Charred roofless insula
  const charred = createCharredInsula(22, 16, 3);
  assert.equal(charred.name, 'charred-roofless-insula', 'Must identify as charred-roofless-insula');
  let hasBurnedJoists = false;
  let hasInteriorDebris = false;
  charred.traverse(child => {
    if (child.name === 'debris-pile') hasInteriorDebris = true;
    if (child.isMesh && child.material?.color?.getHex() === 0x221f1c) hasBurnedJoists = true;
  });
  assert.ok(hasBurnedJoists, 'Charred insula must contain charred wood joists');
  assert.ok(hasInteriorDebris, 'Charred insula must contain interior debris rubble pile');

  // 3. Collapsed arcade
  const arcade = buildCollapsedArcade(26, 12, 5);
  assert.equal(arcade.name, 'collapsed-arcade', 'Must identify as collapsed-arcade');
  let hasFallenDebris = false;
  arcade.traverse(child => {
    if (child.name === 'debris-pile') hasFallenDebris = true;
  });
  assert.ok(hasFallenDebris, 'Collapsed arcade must have fallen keystone debris pile');

  // 4. Props: fallen column drums, shattered stele, debris pile, paving weeds
  const drums = buildFallenColumnDrums(0, 0, 0, 3);
  assert.equal(drums.name, 'fallen-column-drums');
  assert.ok(drums.children.length >= 4, 'Must have drums and stone chunks');

  const stele = buildShatteredStele(0, 0);
  assert.equal(stele.name, 'shattered-stele');
  assert.equal(stele.children.length, 2, 'Must have broken lower and upper fragments');

  const debris = buildDebrisPile(0, 0, 3, 1.2);
  assert.equal(debris.name, 'debris-pile');

  const weeds = buildPavingWeeds(0, 0);
  assert.equal(weeds.name, 'paving-weeds');
  assert.ok(weeds.children.length >= 3, 'Must have crossed grass blades');

  // 5. Evidence classification
  const evidenceMat = getEvidenceMaterial('atmospheric/inferred');
  assert.ok(evidenceMat, 'Evidence material for atmospheric/inferred must resolve');
  assert.equal(evidenceMat.color.getHex(), 0xc98778, 'Evidence color must match atmospheric tint 0xc98778');
});

test('Wave 5 — Period small assets: river reeds, cargo skiffs, footbridges, and aerial bird flocks', async () => {
  const {
    buildRiverReeds,
    buildCargoSkiff,
    buildWoodenFootbridge,
    buildBirdFlock,
  } = await import('../frontend/worlds/shared/assets/props.js');

  // 1. River reeds
  const reeds = buildRiverReeds(10, 20, 15, 3);
  assert.equal(reeds.name, 'river-reeds', 'River reeds group name');
  assert.equal(reeds.position.x, 10);
  assert.equal(reeds.position.z, 20);
  assert.ok(reeds.children.length >= 15, 'Reeds should contain at least 15 stalks');

  // 2. Cargo skiff
  const skiff = buildCargoSkiff(50, 60, 0.5);
  assert.equal(skiff.name, 'cargo-skiff', 'Cargo skiff group name');
  assert.equal(skiff.position.x, 50);
  assert.equal(skiff.position.z, 60);
  assert.equal(skiff.rotation.y, 0.5);
  let hasAmphoraCargo = false;
  let hasMooringPost = false;
  skiff.traverse(child => {
    if (child.name === 'skiff-amphora') hasAmphoraCargo = true;
    if (child.name === 'skiff-mooring-post') hasMooringPost = true;
  });
  assert.ok(hasAmphoraCargo, 'Skiff must carry amphora cargo');
  assert.ok(hasMooringPost, 'Skiff must have mooring post');

  // 3. Wooden footbridge
  const bridge = buildWoodenFootbridge(100, 200, 0.2, 16, 2.5);
  assert.equal(bridge.name, 'wooden-footbridge', 'Wooden footbridge group name');
  assert.equal(bridge.position.x, 100);
  assert.equal(bridge.position.z, 200);
  let stringerCount = 0;
  let plankCount = 0;
  bridge.traverse(child => {
    if (child.name === 'bridge-stringer') stringerCount++;
    if (child.name === 'bridge-plank') plankCount++;
  });
  assert.ok(stringerCount >= 2, 'Must have at least 2 longitudinal stringers');
  assert.ok(plankCount >= 10, 'Must have transverse decking planks');

  // 4. Aerial bird flock
  const flock = buildBirdFlock(0, 45, 0, 12, 35);
  assert.equal(flock.name, 'bird-flock', 'Bird flock group name');
  assert.equal(flock.children.length, 12, 'Flock must instantiate 12 bird meshes');
  assert.ok(typeof flock.userData.update === 'function', 'Flock must expose update(dt)');

  // Test orbital progression over time
  const initialAngle = flock.children[0].userData.orbitAngle;
  flock.userData.update(0.5);
  const updatedAngle = flock.children[0].userData.orbitAngle;
  assert.notEqual(initialAngle, updatedAngle, 'Bird orbit angles must advance on update()');
  assert.equal(flock.position.y, 45, 'Flock group maintains flight altitude');
  assert.ok(flock.children[0].position.y >= 0, 'Birds maintain local elevation');
});
