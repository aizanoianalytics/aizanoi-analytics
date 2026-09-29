import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const builders = readFileSync(new URL('../frontend/worlds/aizanoi-225/js/builders.js', import.meta.url), 'utf8');
const courtAsset = new URL('../frontend/worlds/aizanoi-225/assets/temple_court.glb', import.meta.url);

// temple_of_zeus.glb models podium, cella, architrave and pediment but no
// columns: without a procedural peristasis the hero monument renders as a
// blank white mass from every arrival.
//
// A separate court kit used to be shipped alongside it. It was never placed --
// at its authored scale it rendered as a half-buried 4-metre dollhouse -- so
// the asset has been removed rather than carried as dead weight in the release.
// These assertions are the regression guard for that removal.
test('Aizanoi temple carries a procedural Ionic peristasis, not a buried court kit', () => {
  assert.match(builders, /function buildTemplePeristasis\(templeGroup\)/);
  assert.match(builders, /createIonicColumn\(height, radius, 'marble'\)/);
  assert.match(builders, /getObjectByName\('architrave'\)/, 'column tops must meet the kit architrave');
});

test('the unplaced temple court asset is not shipped or fetched', () => {
  assert.equal(existsSync(courtAsset), false, 'the dead court GLB must not be shipped');
  assert.doesNotMatch(builders, /P\('temple_court'/, 'the court must not be placed');
  assert.doesNotMatch(
    builders.match(/KIT_MANIFEST = \[([\s\S]*?)\];/)[1],
    /temple_court/,
    'the unplaced court must not be fetched by the kit loader',
  );
});
