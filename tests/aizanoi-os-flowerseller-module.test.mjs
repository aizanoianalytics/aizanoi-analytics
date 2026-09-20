import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/flowerseller';

test('Flowerseller is a zero-capability desktop-app module with its own icon', async () => {
  const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
  assert.deepEqual(manifest, {
    manifestVersion: 1,
    id: 'flowerseller',
    type: 'desktop-app',
    entry: './src/index.js',
    enabledByDefault: true,
    requires: [],
    provides: ['desktop-app'],
  });
  assert.ok(existsSync(`${moduleRoot}/index.md`));
  assert.ok(existsSync(`${moduleRoot}/src/index.js`));
  assert.ok(existsSync(`${moduleRoot}/src/app.js`));
  assert.ok(existsSync('frontend/assets/icons/aizanoi-flowerseller.svg'));
  const icon = read('frontend/assets/icons/aizanoi-flowerseller.svg');
  assert.match(icon, /viewBox="0 0 64 64"/);
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

test('Flowerseller UI source is frontend-only, escaped, and has required POC surfaces', () => {
  const source = read(`${moduleRoot}/src/app.js`);
  assert.match(source, /replaceChildren\(\)/);
  assert.match(source, /cleanup\(\)/);
  assert.match(source, /Store/);
  assert.match(source, /README/);
  assert.match(source, /KVKK/);
  assert.match(source, /idempotency/);
  assert.match(source, /function esc/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /api\./);
});
