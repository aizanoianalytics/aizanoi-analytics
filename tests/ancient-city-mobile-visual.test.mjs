import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const runtime = read('frontend/ancient-world/engine/flat-city-runtime.js');
const bootstrap = read('frontend/ancient-world/engine/city-bootstrap.js');
const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
const cities = [
  ['rome', 'frontend/ancient-cities/rome-410-476'],
  ['athens', 'frontend/ancient-cities/athens-450-430'],
];

test('Ancient World exposes a shared Aizanoi-style mobile controller', () => {
  const js = read('frontend/ancient-world/engine/mobile-controls.js');
  const css = read('frontend/ancient-world/engine/mobile-controls.css');
  assert.match(js, /installMobileControls/);
  assert.match(js, /moveX/);
  assert.match(js, /moveY/);
  assert.match(js, /running/);
  assert.match(js, /setPointerCapture/);
  assert.match(css, /#movePad/);
  assert.match(css, /#moveKnob/);
  assert.match(css, /\.mobileActionRail/);
  assert.match(css, /safe-area-inset/);
});

for (const [city, base] of cities) {
  test(`${city} uses shared analog controls and unified city bootstrap`, () => {
    const html = read(`${base}/index.html`);
    const app = read(`${base}/js/app.js`);
    assert.match(html, /mobile-controls\.css/);
    assert.match(html, /city-polish\.css/);
    assert.match(html, new RegExp(`data-city="${city}"`));
    for (const id of ['movePad','moveKnob','mobileRun','mobileInspect','mobileMap']) assert.match(html, new RegExp(`id="${id}"`));
    assert.doesNotMatch(html, /data-move="KeyW"/);
    assert.doesNotMatch(html, /id="lookPad"/);
    assert.match(app, /startAncientCity/);
    assert.doesNotMatch(app, /startFlatBlockyCity|installCityCompatibility|installMobileControls/);
  });
}

test('shared bootstrap delegates compatibility and Research Lens installation once', () => {
  assert.match(bootstrap, /startFlatBlockyCity/);
  assert.match(bootstrap, /installCityCompatibility/);
  assert.match(bootstrap, /installEvidenceMode/);
  assert.match(bootstrap, /ancientWorldTouchMode/);
});

test('shared runtime owns analog movement, run state and mobile look', () => {
  assert.match(runtime, /installMobileControls/);
  assert.match(runtime, /mobile\.snapshot\(\)/);
  assert.match(runtime, /mobileState\.running/);
  assert.match(runtime, /onLook/);
  assert.match(runtime, /SPRINT_SPEED = 7\.2/);
});

test('Athens visible adapter has no Rome copy residue', () => {
  const html = read('frontend/ancient-cities/athens-450-430/index.html');
  const app = read('frontend/ancient-cities/athens-450-430/js/app.js');
  for (const source of [html, app]) {
    assert.doesNotMatch(source, /damaged Rome/i);
    assert.doesNotMatch(source, /present Rome/i);
    assert.doesNotMatch(source, /14 Augustan regiones/i);
    assert.doesNotMatch(source, /Walk the late-antique city/i);
  }
  assert.match(app, /athens-450-430/);
});

test('Athens hero monuments moved into the shared asset library', () => {
  assert.match(assets, /function parthenon/);
  assert.match(assets, /function propylaea/);
  assert.match(assets, /parthenon,/);
  assert.match(assets, /propylaea,/);
});

test('Athens research ledger no longer carries an Augustan filename', () => {
  assert.equal(existsSync(resolve(root, 'research/athens_450_430/augustan_athens_450_430.md')), false);
  assert.equal(existsSync(resolve(root, 'research/athens_450_430/classical_athens_450_430.md')), true);
});

test('city polish still distinguishes Rome and Athens', () => {
  const css = read('frontend/ancient-world/engine/city-polish.css');
  assert.match(css, /body\[data-city="rome"\]/);
  assert.match(css, /body\[data-city="athens"\]/);
  assert.match(css, /--aw-horizon/);
});
