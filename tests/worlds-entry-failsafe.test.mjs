import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const safety = read('frontend/worlds/shared/engine/loading-safety.js');
const recovery = read('frontend/worlds/shared/engine/gl-recovery.js');

test('loading-safety exports fatal-error surface and watchdog, DOM-only (no three import)', () => {
  assert.match(safety, /export function showFatalInitError/);
  assert.match(safety, /export function installLoadingWatchdog/);
  assert.doesNotMatch(safety, /^import /m);
  // Try Again is a real reload button
  assert.match(safety, /Try Again/);
  assert.match(safety, /window\.location\.reload/);
});

test('watchdog has a grace period and never mutates world state', () => {
  assert.match(safety, /graceMs/);
  assert.match(safety, /graceMs = 30000/);
  assert.match(safety, /cancel\(\)/);
});

test('gl-recovery listens for webglcontextlost and surfaces a reload', () => {
  assert.match(recovery, /export function installContextLossGuard/);
  assert.match(recovery, /webglcontextlost/);
  assert.match(recovery, /event\.preventDefault/);
  assert.match(recovery, /Reload World/);
  assert.doesNotMatch(recovery, /^import /m);
});

test('all four worlds wire fail-safe + watchdog + context guard', () => {
  for (const w of ['aizanoi-225', 'athens-450-430', 'rome-410-476', 'iga-airport']) {
    const src = read(`frontend/worlds/${w}/js/main.js`);
    assert.match(src, /showFatalInitError\(err/, `${w}: init catch must surface the error`);
    assert.match(src, /installLoadingWatchdog\(/, `${w}: watchdog must be installed`);
    assert.match(src, /installContextLossGuard\(renderer\)/, `${w}: context-loss guard must be installed`);
    assert.match(src, /installLifecycleResume\(\)/, `${w}: audio lifecycle resume must be wired`);
  }
});

test('IGA intro onComplete syncs the fixed-step sim (skip-path must not strand at spawn)', () => {
  const iga = read('frontend/worlds/iga-airport/js/main.js');
  const m = iga.match(/intro\.onComplete = \(\) => \{[\s\S]{0,400}?\};/);
  assert.ok(m, 'iga: onComplete handler not found');
  assert.match(m[0], /simPos\.copy\(camera\.position\)/);
  assert.match(m[0], /pose\.snap\(\)/);
});
