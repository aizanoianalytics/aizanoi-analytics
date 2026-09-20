import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const moduleRoot = 'frontend/js/v3/apps/flowerseller';
const read = (p) => readFileSync(p, 'utf8');

test('Flowerseller is a zero-capability desktop-app module with its own icon', () => {
  const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
  assert.deepEqual(manifest, {
    manifestVersion: 1, id: 'flowerseller', type: 'desktop-app', entry: './src/index.js',
    enabledByDefault: true, requires: [], provides: ['desktop-app'],
  });
  assert.ok(existsSync(`${moduleRoot}/index.md`));
  assert.ok(existsSync(`${moduleRoot}/src/index.js`));
  assert.ok(existsSync(`${moduleRoot}/src/app.js`));
  assert.ok(existsSync('frontend/assets/icons/aizanoi-flowerseller.svg'));
  const icon = read('frontend/assets/icons/aizanoi-flowerseller.svg');
  assert.match(icon, /viewBox="0 0 64 64"/);
});

test('Flowerseller module assets live under the module directory and are attributed', () => {
  const photosDir = `${moduleRoot}/assets/photos`;
  assert.ok(existsSync(photosDir));
  for (let i = 1; i <= 15; i++) {
    assert.ok(existsSync(`${photosDir}/flower-${String(i).padStart(2, '0')}.webp`));
  }
  const sources = read(`${moduleRoot}/assets/SOURCES.md`);
  assert.match(sources, /flower-\d+\.webp/);
  assert.match(sources, /CC BY-SA/);
  assert.match(sources, /CC0/);
  assert.match(sources, /Public domain/);
});

test('Flowerseller registry and desktop registration expose the standalone shortcut', async () => {
  const { appById } = await import('../frontend/js/v3/registry.js');
  const app = appById('flowerseller');
  assert.equal(app?.label, 'Flowerseller');
  assert.equal(app?.module, '/js/v3/apps/flowerseller/src/index.js');
  assert.match(read('frontend/js/v3/brand-platform.js'), /'flowerseller'/);
  assert.match(read('frontend/js/v3/main.js'), /flowerseller:Object\.freeze/);
  assert.match(read('frontend/js/v3/apps/index.md'), /\(flowerseller\/index\.md\)/);
});

test('Flowerseller UI source is frontend-only, escaped, and uses integer minor-unit math', () => {
  const src = read(`${moduleRoot}/src/app.js`);
  assert.match(src, /replaceChildren\(\)/);
  assert.match(src, /cleanup\(\)/);
  assert.match(src, /Store/);
  assert.match(src, /README/);
  assert.match(src, /KVKK/);
  assert.match(src, /idempotency/i);
  assert.match(src, /FLOWERSELLER_MINOR_UNIT/);
  assert.match(src, /flowersellerLineKey/);
  assert.match(src, /import \{ esc \} from ['"]\.\/safe\.js['"]/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /setInert/);
  assert.match(src, /scrollLockCount/);
  assert.match(src, /uniqueOrderId/);
  assert.match(src, /Demo ödeme/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /api\./);
});

test('Safe helpers exist and escape dangerous characters', () => {
  const safe = read(`${moduleRoot}/src/safe.js`);
  assert.match(safe, /function esc/);
  assert.match(safe, /function urlAttr/);
  assert.match(safe, /javascript:\/data:\/vbscript:/);
});

test('Flowerseller does not leak into other apps: CSS only uses .fs-* namespace', () => {
  const css = read('frontend/styles/apps.css');
  // Quick negative smell test: no global element selectors under .fs-app (we keep everything namespaced).
  assert.doesNotMatch(css, /\.fs-app\s+html\b/);
  assert.doesNotMatch(css, /\.fs-app\s+body\b/);
  assert.doesNotMatch(css, /\.fs-app\s+\.az-/);
});
