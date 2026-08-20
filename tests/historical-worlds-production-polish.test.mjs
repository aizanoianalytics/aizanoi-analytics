import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Aizanoi mobile controls publish both shared and legacy touch-mode hooks', async () => {
  const controls = await read('frontend/ancient-world/engine/mobile-controls.js');
  const aizanoiCss = await read('frontend/historic-world/style-source.css');
  assert.match(aizanoiCss, /body\.touchMode #mobileControls\{display:block\}/, 'Aizanoi still relies on the preserved touchMode CSS hook');
  assert.match(controls, /classList\.add\('ancientTouchMode', 'touchMode'\)/, 'shared controller must publish the legacy Aizanoi touchMode hook');
  assert.match(controls, /classList\.remove\('ancientTouchMode', 'touchMode'\)/, 'shared controller must clean up both touch-mode hooks');
});

test('landmark identity stays pinned until the visitor actually walks away', async () => {
  const compatibility = await read('frontend/ancient-world/engine/city-compatibility.js');
  assert.match(compatibility, /ARRIVAL_IDENTITY_CLEAR_DISTANCE = 3\.5/, 'arrival identity should clear by movement distance, not a short timer');
  assert.match(compatibility, /pinArrivalIdentity\(debug, id, ui\)/, 'all city UIs should use the shared arrival identity pin');
  assert.match(compatibility, /Math\.hypot\(current\.x - startX, current\.z - startZ\) > ARRIVAL_IDENTITY_CLEAR_DISTANCE/, 'identity pin must release after meaningful movement');
  assert.match(compatibility, /arrivalIdentityPinnedUntilMovement: true/, 'compatibility contract should publish the movement-based identity guarantee');
});

test('flat-ground hero arrivals avoid the old blocking approaches', async () => {
  const rome = await read('frontend/ancient-cities/rome-410-476/data/city.js');
  const athens = await read('frontend/ancient-cities/athens-450-430/data/city.js');
  assert.match(rome, /colosseum: \{ distance: 165, preferredDirections: \[\[1,0\],\[1,1\],\[1,-1\],\[0,1\]\] \}/, 'Colosseum should prefer the clear east-side flat-ground approach');
  assert.match(athens, /parthenon: \{ distance: 95, preferredDirections: \[\[0,-1\],\[1,-1\],\[-1,-1\],\[1,0\]\] \}/, 'Parthenon should avoid the Propylaea-blocked west approach');
});
