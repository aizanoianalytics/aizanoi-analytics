import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, compactAizanoiLayout } from '../frontend/worlds/aizanoi-225/js/city-data.js';

const compact = compactAizanoiLayout();
const byId = new Map(compact.BUILDINGS.map((b) => [b.id, b]));

/** Axis-aligned footprint of a building's booking. */
function bounds(building) {
  return {
    x0: building.x - building.w / 2,
    x1: building.x + building.w / 2,
    z0: building.z - building.d / 2,
    z1: building.z + building.d / 2,
  };
}

function overlap(a, b) {
  const ax = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const az = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ax > 0 && az > 0 ? ax * az : 0;
}

test('compaction gives the kit a uniform factor the authored geometry can be fitted to', () => {
  for (const b of compact.BUILDINGS) {
    assert.equal(b.fitScale, Math.min(0.39, 0.88), `${b.id} carries the shared fit factor`);
  }
  // The height a monument is drawn at has to agree with the factor its geometry
  // is placed at, or framing maths aims at a point that does not exist.
  for (const raw of BUILDINGS) {
    const c = byId.get(raw.id);
    assert.ok(
      Math.abs(c.h - raw.h * c.fitScale) < 1e-9,
      `${raw.id} reports the height it actually renders at`,
    );
  }
});

// The stadium and the great bath are authored as a shared bath-and-circus
// block: in the survey frame the bath sits inside the stadium's eastern end
// (raw overlap 32.3 x 20.2), and compacting the plan preserves that rather than
// inventing a separation the survey does not claim.
const SHARED_PRECINCTS = new Set(['greatbath|stadium']);

test('no two compacted monuments overlap in plan', () => {
  const clashes = [];
  for (let i = 0; i < compact.BUILDINGS.length; i++) {
    for (let j = i + 1; j < compact.BUILDINGS.length; j++) {
      const a = compact.BUILDINGS[i];
      const b = compact.BUILDINGS[j];
      const key = [a.id, b.id].sort().join('|');
      if (overlap(bounds(a), bounds(b)) > 0 && !SHARED_PRECINCTS.has(key)) clashes.push(key);
    }
  }
  assert.deepEqual(clashes, [], 'monuments must not be booked into each other');
});

test('the only remaining overlap is the shared stadium-bath precinct, and it shrinks with the plan', () => {
  const stadium = byId.get('stadium');
  const bath = byId.get('greatbath');
  const raw = new Map(BUILDINGS.map((b) => [b.id, b]));
  const now = overlap(bounds(stadium), bounds(bath));
  const was = overlap(bounds(raw.get('stadium')), bounds(raw.get('greatbath')));
  assert.ok(now > 0, 'the shared precinct is still shared after compaction');
  assert.ok(now < was, 'compaction reduces the shared area rather than growing it');
});

test('focal monuments stay separated, which the layout has always promised', () => {
  const temple = byId.get('temple');
  const agora = byId.get('agora');
  assert.ok(
    Math.abs(temple.x - agora.x) > (temple.w + agora.w) / 2,
    'temple and agora keep their documented separation',
  );
});

test('compaction still shrinks the map and keeps the evidence record intact', () => {
  const raw = BUILDINGS;
  const span = (xs) => Math.max(...xs) - Math.min(...xs);
  const source = span(raw.map((b) => b.x));
  const shrunk = span(compact.BUILDINGS.map((b) => b.x));
  assert.ok(shrunk / source <= 0.82, 'the map still fits its play space');
  assert.deepEqual(compact.BUILDINGS.map((b) => b.id), raw.map((b) => b.id));
  assert.ok(compact.BUILDINGS.every((b) => b.evidence?.level), 'evidence survives compaction');
});
