import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const brandPlatform = read('frontend/js/v3/brand-platform.js');
const registry = read('frontend/js/v3/registry.js');
const analytics = read('frontend/js/v3/apps/analytics/src/app.js');
const calculator = read('frontend/js/v3/apps/calculator/src/app.js');
const winamp = read('frontend/js/v3/apps/winamp/src/app.js');
const root = read('frontend/index.html');
const serviceWorker = read('frontend/service-worker.js');

test('desktop keeps the five core apps and adds Arcade plus Recycle Bin', () => {
  assert.match(brandPlatform, /const DESKTOP=Object\.freeze\(\[\.\.\.PINNED,'games','recycle-bin'\]\)/);
  assert.match(registry, /id:'recycle-bin'.*icon:'\/assets\/icons\/recycle-bin\.svg'/s);
  assert.match(registry, /id:'camera'.*icon:'\/assets\/icons\/camera\.svg'/s);
  assert.match(registry, /id:'winamp'.*icon:'\/assets\/icons\/winamp\.svg'/s);
  for (const icon of ['recycle-bin.svg', 'camera.svg', 'winamp.svg']) {
    assert.ok(existsSync(`frontend/assets/icons/${icon}`), `${icon} should exist`);
  }
});

test('Analytics is a data-driven multi-set catalog and does not need the standalone collection page for navigation', () => {
  assert.match(analytics, /export const ANALYTICS_SETS/);
  assert.match(analytics, /data-analytics-set=/);
  assert.match(analytics, /data-analytics-dashboard-list/);
  assert.match(analytics, /data-analytics-dashboard-inventory/);
  assert.match(analytics, /More sets can land here/);
  assert.match(analytics, /hr-analytics-full-set-synthetic-output\.xlsx/);
});

test('Calculator keypad is explicitly four-column friendly', () => {
  assert.match(calculator, /data-calc="÷"/);
  assert.match(calculator, /data-calc="×"/);
  assert.match(calculator, /data-calc="="/);
  assert.doesNotMatch(calculator, /az-app-toolbar/);
});

test('Winamp play resumes a persisted playlist by resolving the first track', () => {
  assert.match(winamp, /async function resumePlayback\(\)/);
  assert.match(winamp, /if \(index < 0 \|\| !audio\.getAttribute\('src'\)\) return play\(index < 0 \? 0 : index\)/);
  assert.doesNotMatch(winamp, /az-app-toolbar/);
});

test('polish stylesheet is loaded and precached', () => {
  assert.ok(existsSync('frontend/styles/polish.css'));
  assert.match(root, /\/styles\/polish\.css/);
  assert.match(serviceWorker, /\/styles\/polish\.css/);
  assert.match(serviceWorker, /aizanoi-os-shell-v4\.3\.3/);
});
