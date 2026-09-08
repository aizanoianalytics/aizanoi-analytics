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
