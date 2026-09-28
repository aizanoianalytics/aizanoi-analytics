// Arrival framing contract for Historical Worlds.
//
// The 2026-09-28 visual audit found that Athens opened on an empty slope with the
// Parthenon reduced to an unreadable sliver. Four separate defects combined:
//   1. the arrival stood ~487 units from the landmark;
//   2. the Old Temple of Athena Polia and the Hekatompedon footprint sat on the
//      sight line, presenting a featureless wall;
//   3. the three "hero" GLBs are single untextured primitives — the Parthenon
//      asset is a mesh literally named "Cube.001" — so the Acropolis rendered as
//      blank tan boxes because the procedural temple builder was bypassed;
//   4. the arrival used a raw `SPAWN` position set, so after the 2026-09-16
//      anisotropic compaction it could land behind geometry or facing a blank
//      flank, no matter how correct the authored coordinates looked in isolation.
//
// The fix routes every arrival through the same collision-safe framing the
// teleport menu already uses (landmarkStandoff + collision.findSafeSpawn +
// teleportFacing) and returns the hero monuments to their procedural builders.
// That is the contract these tests protect, because the authored SPAWN
// coordinates are plan-space intent, not a camera pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPAWN as ROME_SPAWN, BUILDINGS as ROME_BUILDINGS } from '../frontend/worlds/rome-410-476/js/city-data.js';
import { SPAWN as ATHENS_SPAWN, BUILDINGS as ATHENS_BUILDINGS } from '../frontend/worlds/athens-450-430/js/city-data.js';
import { compactAirportLayout } from '../frontend/worlds/iga-airport/js/airport-data.js';
import { landmarkStandoff, landmarkTargetHeight } from '../frontend/worlds/shared/engine/framing.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function facingAlignment(spawn, target) {
  const fx = Math.sin(spawn.angle);
  const fz = Math.cos(spawn.angle);
  const dx = target.x - spawn.x;
  const dz = target.z - spawn.z;
  const length = Math.hypot(dx, dz);
  return (fx * dx + fz * dz) / length;
}

// Aizanoi is deliberately absent from this table.
//
// Athens, Rome and IGA were converted to the teleport framing path and verified
// in a real browser. Aizanoi was not: on 2026-09-28 the same conversion was
// written, but the arrival frames measured across repeated runs disagreed with
// each other, so the change was reverted rather than shipped unverified. Its
// arrival still uses a raw `SPAWN` position set, and the temple still opens
// behind whatever occupies the sanctuary approach.
//
// It stays out of this file until that is fixed and measured, so this suite can
// never be read as claiming Aizanoi is covered. Adding Aizanoi back requires
// the same evidence the other three have: a landing with a clear sight line to
// 'temple', verified in a real browser.
const cases = [
  ['Rome', { SPAWN: ROME_SPAWN, BUILDINGS: ROME_BUILDINGS }, 'colosseum', 'rome-410-476'],
  ['Athens', { SPAWN: ATHENS_SPAWN, BUILDINGS: ATHENS_BUILDINGS }, 'parthenon', 'athens-450-430'],
  ['IGA', compactAirportLayout(), 'terminal', 'iga-airport'],
];

// The arrival must be solved by the same code the teleport menu uses. A second,
// weaker path can disagree with it, and that disagreement is what shipped.
//
// IGA is a deliberate exception: its intro flies the camera to an airside
// landing point and `onComplete` keeps that pose instead of re-deriving one, so
// it must not silently regress into a raw position set either. It is checked by
// asserting it neither calls teleportTo with SPAWN nor drops the sim sync.
for (const [name, , landmarkId, slug] of cases) {
  test(`${name} arrival is framed by the teleport path, not a raw position set`, () => {
    const source = read(`frontend/worlds/${slug}/js/main.js`);
    const start = source.indexOf('intro.onComplete');
    assert.notEqual(start, -1, `${name} has no intro.onComplete arrival handler`);
    // The handler body is brace-matched rather than sliced by a fixed length:
    // Aizanoi's version carries a long explanatory comment, and a naive window
    // either truncates the logic or spills into the next statement.
    const onComplete = (() => {
      const open = source.indexOf('{', start);
      let depth = 0;
      for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
          depth--;
          if (depth === 0) return source.slice(start, i + 1);
        }
      }
      return source.slice(start);
    })();

    if (name === 'IGA') {
      assert.doesNotMatch(
        onComplete,
        /teleportTo\(SPAWN\.x/,
        'IGA keeps its cinematic landing; it must not fall back to the raw SPAWN position',
      );
      assert.match(onComplete, /simPos\.copy\(camera\.position\)/, 'IGA must sync the sim to the landing pose');
      return;
    }


    assert.match(
      onComplete,
      /collision\.findSafeSpawn\(/,
      `${name} arrival does not run the collision-safe spawn search`,
    );
    assert.match(onComplete, /controls\.teleportFacing\(/, `${name} arrival does not look at ${landmarkId}`);
    assert.match(
      onComplete,
      /landmarkStandoff\(/,
      `${name} arrival does not size its distance from the monument`,
    );
  });
}

for (const [name, world, landmarkId] of cases) {
  test(`${name} arrival faces a readable primary landmark`, () => {
    const target = world.BUILDINGS.find((building) => building.id === landmarkId);
    assert.ok(target, `${name} primary landmark missing`);
    assert.ok(
      facingAlignment(world.SPAWN, target) >= 0.75,
      `${name} spawn faces away from ${landmarkId}`,
    );
  });
}

// Facing the right direction is not enough: if the authored arrival stands so far
// back that the landmark is a thin strip above an empty foreground, the plan is
// wrong regardless of how the runtime re-frames it.
const MAX_ARRIVAL_DISTANCE = { Aizanoi: 80, Rome: 400, Athens: 260, IGA: 300 };

for (const [name, world, landmarkId] of cases) {
  test(`${name} authored arrival stands close enough to read the landmark`, () => {
    const target = world.BUILDINGS.find((building) => building.id === landmarkId);
    assert.ok(target, `${name} primary landmark missing`);
    const distance = Math.hypot(target.x - world.SPAWN.x, target.z - world.SPAWN.z);
    const limit = MAX_ARRIVAL_DISTANCE[name];
    assert.ok(
      distance <= limit,
      `${name} arrival is ${distance.toFixed(0)} units from ${landmarkId}, over the ${limit}-unit reading limit`,
    );
  });

  test(`${name} authored arrival does not stand inside a solid building footprint`, () => {
    const { x, z } = world.SPAWN;
    // Canopies, plazas and other low walkable structures legitimately span the
    // arrival point (IGA's curbside drop-off canopy is h=6 with a plausible
    // evidence level) — only a genuinely solid mass is a defect.
    const SOLID_MIN_HEIGHT = 8;
    const intersecting = world.BUILDINGS.filter(
      (b) =>
        b.h >= SOLID_MIN_HEIGHT &&
        !(x < b.x - b.w / 2 || x > b.x + b.w / 2 || z < b.z - b.d / 2 || z > b.z + b.d / 2),
    ).map((b) => `${b.id}(h=${b.h})`);
    assert.deepEqual(intersecting, [], `${name} spawn overlaps ${intersecting.join(', ')}`);
  });
}

// The monuments that read as blank boxes must be real geometry, not placeholder
// primitives. This is the check that would have caught the Athens regression on
// its own: parthenon_hero.glb is a single mesh named "Cube.001".
test('Athens hero monuments are procedural, not placeholder primitives', () => {
  const builders = read('frontend/worlds/athens-450-430/js/builders.js');
  const heroBlock = builders.match(/const HERO_ASSETS = \{([^}]*)\}/);
  assert.ok(heroBlock, 'HERO_ASSETS map not found');
  assert.equal(
    heroBlock[1].trim(),
    '',
    `hero monuments still bypass the procedural builders: ${heroBlock[1].trim()}`,
  );
  // And the temple builder must actually model a peripteral colonnade.
  const temple = builders.slice(builders.indexOf('export function buildTemple'));
  assert.match(temple, /colCountD = isParthenon \? 17/, 'the Parthenon must have 17 columns on its flanks');
  assert.match(temple, /colCountW = isParthenon \? 8/, 'the Parthenon must be octastyle');
});

// Footprints must scale with their own axis. The compaction halved w a second
// time on top of the 0.38 x-factor and never touched d, so the Parthenon's
// source-accurate 69.5 x 30.9 m plan shipped as 69.5 x 11.7 m — a slab.
test('Athens compacts each footprint axis with its own factor', () => {
  const source = read('frontend/worlds/athens-450-430/js/city-data.js');
  const loop = source.slice(source.indexOf('for (const building of BUILDINGS)'));
  assert.match(loop, /building\.w \*= COMPACTION\.xFactor/, 'w must scale by xFactor');
  assert.match(loop, /building\.d \*= COMPACTION\.zFactor/, 'd must scale by zFactor');
  const parthenon = ATHENS_BUILDINGS.find((b) => b.id === 'parthenon');
  assert.ok(parthenon.w > 0 && parthenon.d > 0, 'the Parthenon must keep a real footprint');
});

// The standoff the arrival uses is the shared framing math, not a magic number,
// so a monument that grows taller automatically frames better.
test('arrival standoff is derived from the monument, not hard-coded', () => {
  const parthenon = ATHENS_BUILDINGS.find((b) => b.id === 'parthenon');
  const standoff = landmarkStandoff(parthenon, { verticalFov: 65 });
  assert.ok(standoff >= 36, `standoff too close: ${standoff}`);
  assert.ok(
    standoff <= 200,
    `standoff ${standoff} would push the ${parthenon.h}m temple into an unreadable strip`,
  );
  assert.ok(landmarkTargetHeight(parthenon) > 0, 'landmark look-at height must be positive');
});
