import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const brandPlatform = read('frontend/js/v3/brand-platform.js');
const registry = read('frontend/js/v3/registry.js');
const analytics = read('frontend/js/v3/apps/analytics/src/app.js');
const analyticsCatalog = read('frontend/analytics/catalog.js');
const analyticsLanding = read('frontend/analytics/index.html');
const calculator = read('frontend/js/v3/apps/calculator/src/app.js');
const winamp = read('frontend/js/v3/apps/winamp/src/app.js');
const dialog = read('frontend/js/v3/workspace/dialog.js');
const workspaceFs = read('frontend/js/v3/workspace/fs.js');
const polish = read('frontend/styles/polish.css');
const nginxStaticHeaders = read('infra/nginx/snippets/aizanoi-static-security-headers.conf.example');
const root = read('frontend/index.html');
const serviceWorker = read('frontend/service-worker.js');

test('desktop keeps the five core apps and adds Arcade plus Recycle Bin', () => {
  assert.match(brandPlatform, /const DESKTOP=Object\.freeze\(\[\.\.\.PINNED,'games','recycle-bin'\]\)/);
  assert.match(registry, /id:'recycle-bin'.*icon:'\/assets\/icons\/aizanoi-recycle-bin\.svg'/s);
  assert.match(registry, /id:'camera'.*icon:'\/assets\/icons\/camera\.svg'/s);
  assert.match(registry, /id:'winamp'.*icon:'\/assets\/icons\/winamp\.svg'/s);
  for (const icon of ['aizanoi-recycle-bin.svg', 'camera.svg', 'winamp.svg']) assert.ok(existsSync(`frontend/assets/icons/${icon}`));
});

test('Analytics has one canonical catalog consumed by both public surfaces', () => {
  assert.match(analyticsCatalog, /export const ANALYTICS_SETS/);
  assert.match(analyticsCatalog, /hr-analytics-full-set-synthetic-output\.xlsx/);
  assert.match(analytics, /from '\/analytics\/catalog\.js'/);
  assert.doesNotMatch(analytics, /const HR_DASHBOARDS/);
  assert.match(analyticsLanding, /\/analytics\/app\.js/);
  assert.doesNotMatch(analyticsLanding, /Workforce Turnover Analytics/);
});

test('desktop app polish never overrides canonical window geometry', () => {
  assert.doesNotMatch(polish, /data-app-id="calculator"[^}]*!important/s);
  assert.doesNotMatch(polish, /data-app-id="winamp"[^}]*!important/s);
  assert.doesNotMatch(polish, /data-app-id="recycle-bin"[^}]*!important/s);
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
});

test('Workspace multi-node writes use one serialized read-write mutation transaction', () => {
  assert.match(workspaceFs, /async function mutateNodes\(mutator\)/);
  assert.match(workspaceFs, /db\.transaction\(STORE, 'readwrite'\)/);
  assert.match(workspaceFs, /return mutateNodes\(\(map, ops\) =>/);
});

test('production shell policy permits explicit local Camera and blob-backed Winamp playback', () => {
  assert.match(nginxStaticHeaders, /microphone=\(self\)/);
  assert.match(nginxStaticHeaders, /camera=\(self\)/);
  assert.match(nginxStaticHeaders, /media-src 'self' blob:/);
  assert.match(nginxStaticHeaders, /geolocation=\(\)/);
});

test('application confirmations use the canonical focus-safe dialog and never promote Enter globally', () => {
  assert.match(dialog, /az-overlay is-open/);
  assert.match(dialog, /root\.inert = true/);
  assert.match(dialog, /opener\?\.isConnected/);
  assert.doesNotMatch(dialog, /event\.key === 'Enter'/);
  assert.doesNotMatch(dialog, /az-w98-overlay|az-w98-dialog|az-w98-titlebar/);
});

test('polish stylesheet is loaded and precached', () => {
  assert.ok(existsSync('frontend/styles/polish.css'));
  assert.match(root, /\/styles\/polish\.css/);
  assert.match(serviceWorker, /\/styles\/polish\.css/);
});
