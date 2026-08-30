import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const sw = read('frontend/service-worker.js');
const index = read('frontend/index.html');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const architecture = read('ARCHITECTURE.md');

const retiredToolFiles = [
  'frontend/js/v3/archive-store.js',
  'frontend/js/v3/apps/archive.js',
  'frontend/js/v3/apps/research.js',
  'frontend/js/v3/apps/projects.js',
  'frontend/js/v3/apps/terminal.js',
  'frontend/js/v3/apps/monitor.js'
];

test('Aizanoi public runtime remains static-only', () => {
  assert.equal(existsSync('backend'), false, 'backend directory must remain removed');
  assert.equal(existsSync('infra/systemd/aizanoi-backend.service.example'), false, 'obsolete backend systemd unit returned');
  assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);
  assert.doesNotMatch(index, /\/api\/(?:chat|health|terminal)/);
  assert.doesNotMatch(architecture, /Node backend/i);
});

test('retired Workbench runtime files remain removed', () => {
  for (const file of retiredToolFiles) assert.equal(existsSync(file), false, `${file} must remain retired`);
});

test('service worker never handles API routes', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(sw, /\/api\/chat|\/api\/health|\/api\/terminal\/exec/);
});

test('service worker core precache includes the adaptive shell and remains complete-or-fail', () => {
  assert.match(sw, /aizanoi-os-shell-v4\.3\.2/);
  assert.match(sw, /cache:'reload'/);
  assert.match(sw, /if \(!response\.ok\) throw new Error/);
  const installBlock = sw.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(installBlock, /event\.waitUntil\(precacheShell\(\)\)/);
  assert.doesNotMatch(installBlock, /skipWaiting/);
  const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.match(precache, /\/js\/v3\/shell\.js/);
  assert.match(precache, /\/js\/v3\/aizanoi-os\.js/);
  assert.match(precache, /\/js\/v3\/brand-platform\.js/);
  assert.match(precache, /\/js\/v3\/module-registry\.generated\.js/);
  assert.match(precache, /\/styles\/device-shell\.css/);
  assert.match(precache, /\/news\/index\.json/);
  assert.match(precache, /\/assets\/wallpapers\/aizanoi-os-sunrise\.svg/);
  assert.doesNotMatch(precache, /\/styles\/apps\.css|\/js\/v3\/archive-store\.js|\/js\/v3\/apps\//, 'lazy app assets must not be pulled during service-worker install');
});

test('mutable static requests are network-first with cache fallback for offline use', () => {
  assert.match(sw, /async function networkFirstStatic\(request\)/);
  assert.match(sw, /const response = await fetch\(request\)/);
  assert.match(sw, /if \(response\.ok\) await cache\.put\(request, response\.clone\(\)\)/);
  assert.match(sw, /const cached = await cache\.match\(request\)/);
  assert.match(sw, /event\.respondWith\(networkFirstStatic\(request\)\)/);
});

test('nginx fails closed for historical API paths', () => {
  assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
  assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);
});

test('static delivery baseline enables compression and correct manifest MIME', () => {
  assert.match(nginx, /gzip on;/);
  assert.match(nginx, /application\/manifest\+json/);
  assert.match(nginx, /location = \/\.well-known\/security\.txt/);
  assert.match(nginx, /script-src 'self';/);
  assert.doesNotMatch(nginx, /script-src[^;]*unsafe-inline/);
});
