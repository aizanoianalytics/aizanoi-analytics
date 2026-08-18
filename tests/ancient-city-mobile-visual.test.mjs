import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
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
  test(`${city} uses shared analog mobile controls and visual polish`, () => {
    const html = read(`${base}/index.html`);
    const app = read(`${base}/js/app.js`);
    assert.match(html, /mobile-controls\.css/);
    assert.match(html, /city-polish\.css/);
    assert.match(html, new RegExp(`data-city="${city}"`));
    assert.match(html, /id="movePad"/);
    assert.match(html, /id="moveKnob"/);
    assert.match(html, /id="mobileRun"/);
    assert.match(html, /id="mobileInspect"/);
    assert.match(html, /id="mobileMap"/);
    assert.doesNotMatch(html, /data-move="KeyW"/);
    assert.doesNotMatch(html, /id="lookPad"/);
    assert.match(app, /installMobileControls/);
    assert.match(app, /mobileControls\?\.snapshot/);
    assert.match(app, /mobile\.running/);
    assert.doesNotMatch(app, /\$\$\('\[data-move\]'\)/);
    assert.match(app, /buildAtmosphericDetails/);
    assert.match(app, /const bob = Math\.sin\(walkClock \* 2\)/);
    assert.match(app, /installBackToOS/);
  });
}

test('Athens visible experience has no Rome copy residue', () => {
  const html = read('frontend/ancient-cities/athens-450-430/index.html');
  const app = read('frontend/ancient-cities/athens-450-430/js/app.js');
  for (const source of [html, app]) {
    assert.doesNotMatch(source, /damaged Rome/i);
    assert.doesNotMatch(source, /present Rome/i);
    assert.doesNotMatch(source, /14 Augustan regiones/i);
    assert.doesNotMatch(source, /Walk the late-antique city/i);
  }
  assert.match(app, /present-day Athens/);
  assert.match(app, /District atlas · Classical Athens/);
});

test('Athens gives Acropolis hero monuments dedicated builders', () => {
  const app = read('frontend/ancient-cities/athens-450-430/js/app.js');
  assert.match(app, /function parthenonHero/);
  assert.match(app, /frontCount = TOUCH \? 8 : 8/);
  assert.match(app, /sideCount = TOUCH \? 13 : 17/);
  assert.match(app, /function propylaeaHero/);
  assert.match(app, /building\.id === 'parthenon'/);
  assert.match(app, /building\.id === 'propylaea'/);
});

test('Athens research ledger no longer carries an Augustan filename', () => {
  assert.equal(existsSync(resolve(root, 'research/athens_450_430/augustan_athens_450_430.md')), false);
  assert.equal(existsSync(resolve(root, 'research/athens_450_430/classical_athens_450_430.md')), true);
});

test('city polish distinguishes Rome and Athens instead of applying one generic grade', () => {
  const css = read('frontend/ancient-world/engine/city-polish.css');
  assert.match(css, /body\[data-city="rome"\]/);
  assert.match(css, /body\[data-city="athens"\]/);
  assert.match(css, /--aw-horizon/);
});
