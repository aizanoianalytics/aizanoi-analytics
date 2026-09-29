import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const builders = fs.readFileSync(new URL('../frontend/worlds/aizanoi-225/js/builders.js', import.meta.url), 'utf8');

// temple_of_zeus.glb models podium, cella, architrave and pediment but no
// columns: without a procedural peristasis the hero monument renders as a
// blank white mass from every arrival, and the old temple_court.glb piece
// rendered as a half-buried 4-metre dollhouse.
test('Aizanoi temple carries a procedural Ionic peristasis, not the buried court', () => {
  assert.match(builders, /function buildTemplePeristasis\(templeGroup\)/);
  assert.match(builders, /createIonicColumn\(height, radius, 'marble'\)/);
  assert.match(builders, /getObjectByName\('architrave'\)/, 'column tops must meet the kit architrave');
  assert.doesNotMatch(builders, /P\('temple_court'/, 'buried dollhouse court must not be placed');
  assert.doesNotMatch(
    builders.match(/KIT_MANIFEST = \[([\s\S]*?)\];/)[1],
    /temple_court/,
    'unplaced court must not be fetched by the kit loader',
  );
});
