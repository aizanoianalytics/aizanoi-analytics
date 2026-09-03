import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const brandPlatform = read('frontend/js/v3/brand-platform.js');
const registry = read('frontend/js/v3/registry.js');
const main = read('frontend/js/v3/main.js');
const analytics = read('frontend/js/v3/apps/analytics/src/app.js');
const analyticsCatalog = read('frontend/analytics/catalog.js');
const analyticsLanding = read('frontend/analytics/index.html');
const calculator = read('frontend/js/v3/apps/calculator/src/app.js');
const winamp = read('frontend/js/v3/apps/winamp/src/app.js');
const dialog = read('frontend/js/v3/workspace/dialog.js');
const workspaceFs = read('frontend/js/v3/workspace/fs.js');
const shellCss = read('frontend/styles/shell.css');
const appsCss = read('frontend/styles/apps.css');
const nginxStaticHeaders = read('infra/nginx/snippets/aizanoi-static-security-headers.conf.example');
const root = read('frontend/index.html');
const serviceWorker = read('frontend/service-worker.js');

test('desktop keeps the five core apps and promotes a curated utility set', () => {
  assert.match(brandPlatform, /const DESKTOP=Object\.freeze\(\[\.\.\.PINNED,'browser','notepad','web-editor','calculator','camera','winamp','games','recycle-bin','workspace'\]\)/);
  assert.match(registry, /id:'recycle-bin'.*icon:'\/assets\/icons\/aizanoi-recycle-bin\.svg'/s);
  assert.match(registry, /id:'camera'.*icon:'\/assets\/icons\/camera\.svg'/s);
  assert.match(registry, /id:'winamp'.*icon:'\/assets\/icons\/winamp\.svg'/s);
  assert.match(registry, /id:'browser'.*icon:'\/assets\/icons\/browser\.svg'/s);
  assert.match(registry, /id:'web-editor'.*label:'Aizanoi Web Editor'/s);
  for (const icon of ['aizanoi-recycle-bin.svg', 'camera.svg', 'winamp.svg', 'browser.svg']) assert.ok(existsSync(`frontend/assets/icons/${icon}`));
});

test('Analytics has one canonical catalog consumed by both public surfaces', () => {
  assert.match(analyticsCatalog, /export const ANALYTICS_SETS/);
  assert.match(analyticsCatalog, /hr-analytics-full-set-synthetic-output\.xlsx/);
  assert.match(analytics, /from ['"][^'"]*analytics\/catalog\.js['"]/);
  assert.doesNotMatch(analytics, /const HR_DASHBOARDS/);
  assert.match(analyticsLanding, /\/analytics\/app\.js/);
  assert.doesNotMatch(analyticsLanding, /Workforce Turnover Analytics/);
});

test('canonical shell layer never overrides window geometry with CSS importance', () => {
  // Per-app shell finalization lives in @layer shell (formerly polish.css/tool-windows.css).
  // Compact frameless windows are part of canonical shell ownership and are allowed to use
  // !important; what we forbid is shell-level geometry being clobbered by a separate patch layer.
  for (const stylesheet of ['polish.css', 'tool-windows.css', 'utility-polish.css']) {
    assert.ok(!existsSync(`frontend/styles/${stylesheet}`), `legacy patch stylesheet ${stylesheet} must be retired`);
  }
  // The shell layer may declare !important for canonical responsive + frameless windows.
  // The apps layer must not introduce window geometry !important rules.
  assert.doesNotMatch(appsCss, /data-app-id="[^"]+"[^}]*(?:left|top|width|height|transform):[^;{}]*!important/s);
});

test('utility windows get compact first-run geometry while preserving user-sized windows', () => {
  assert.match(main, /const UTILITY_WINDOW_PREFS=Object\.freeze/);
  assert.match(main, /calculator:Object\.freeze\(\{width:470,height:640/);
  assert.match(main, /winamp:Object\.freeze\(\{width:620,height:520/);
  assert.match(main, /camera:Object\.freeze\(\{width:760,height:620/);
  assert.match(main, /games:Object\.freeze\(\{width:920,height:700/);
  assert.match(main, /'recycle-bin':Object\.freeze\(\{width:860,height:560/);
  assert.match(main, /api\.store\.windowRect\?\.\(appId\)/);
  assert.match(main, /windowEl\.dataset\.azPreferredRectApplied='preserved'/);
  assert.match(main, /api\.store\.saveWindowRect\?\.\(appId,rect\)/);
});

test('canonical apps layer keeps Workspace empty-state static CSS without injecting a style element', () => {
  // App-interior polish (formerly utility-polish.css) lives in @layer apps.
  assert.match(appsCss, /\.az-workspace-grid > \.az-empty-state \{ grid-column:1\/-1;min-height:280px/);
  assert.match(appsCss, /\.az-workspace-grid > \.az-empty-state > div \{ max-width:380px/);
  assert.doesNotMatch(main, /document\.createElement\(['"]style['"]\)/);
  assert.doesNotMatch(main, /installWorkspaceEmptyStatePolish/);
});

test('effective reduced motion bridges saved preference and live system preference to the body class', () => {
  assert.match(main, /function installReducedMotionSync\(api\)/);
  assert.match(main, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(main, /api\.store\.getState\(\)\.reduceMotion\|\|media\.matches/);
  assert.match(main, /document\.body\.classList\.toggle\('az-reduce-motion'/);
  assert.match(main, /media\.addEventListener\('change',sync\)/);
  assert.match(main, /api\.store\.subscribe/);
});

test('Calculator keypad is explicitly four-column friendly', () => {
  assert.match(calculator, /data-calc="÷"/);
  assert.match(calculator, /data-calc="×"/);
  assert.match(calculator, /data-calc="="/);
  assert.doesNotMatch(calculator, /az-app-toolbar/);
});

test('Winamp play resumes a persisted playlist by resolving the first track', () => {
  assert.match(winamp, /async function resumePlayback\(\)/);
  assert.match(winamp, /if\s*\(\s*index\s*<\s*0\s*\|\|\s*!audio\.getAttribute\('src'\)\s*\)\s*return\s+play\(\s*index\s*<\s*0\s*\?\s*0\s*:\s*index\s*\)/);
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

test('canonical stylesheets are loaded by the shell and precached', () => {
  // Root shell loads the canonical boot stylesheet chain.
  for (const stylesheet of ['tokens.css', 'base.css', 'shell.css', 'components.css', 'device-shell.css']) {
    assert.match(root, new RegExp(`/styles/${stylesheet.replace('.', '\\.')}`), `root must load ${stylesheet}`);
    assert.match(serviceWorker, new RegExp(`/styles/${stylesheet.replace('.', '\\.')}`), `service worker must precache ${stylesheet}`);
  }
  // apps.css is the lazy app-interior layer; the shell dynamically attaches it
  // when an app opens. It must NOT be in the root boot chain (avoids first-paint waste)
  // and must NOT be precached (lazy network-first keeps it fresh).
  assert.doesNotMatch(root, /\/styles\/apps\.css/);
  assert.doesNotMatch(serviceWorker, /'\/styles\/apps\.css'/);
  // brand-platform dynamic style wire points at the canonical shell, not a patch layer.
  assert.doesNotMatch(root, /\/styles\/polish\.css/);
  assert.doesNotMatch(root, /\/styles\/utility-polish\.css/);
  assert.doesNotMatch(root, /\/styles\/tool-windows\.css/);
  assert.match(brandPlatform, /\/styles\/shell\.css/);
  assert.doesNotMatch(brandPlatform, /\/styles\/tool-windows\.css/);
});
