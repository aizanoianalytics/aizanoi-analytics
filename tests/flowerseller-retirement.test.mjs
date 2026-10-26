import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { appById, canonicalAppId, searchableEntries } from '../frontend/js/v3/registry.js';
import { enabledModuleById } from '../frontend/js/v3/module-registry.generated.js';

const read = (path) => readFileSync(path, 'utf8');

test('retired Flowerseller cannot launch or appear in application search', () => {
  assert.equal(appById('flowerseller'), null);
  assert.equal(canonicalAppId('flowerseller'), null);
  assert.equal(enabledModuleById('flowerseller'), null);
  assert.equal(searchableEntries().some(({ id }) => id === 'flowerseller'), false);
  assert.ok(appById('labs'), 'surviving apps remain available');
});

test('retired Flowerseller assets, shortcuts and module are absent', () => {
  assert.equal(existsSync('frontend/js/v3/apps/flowerseller'), false);
  assert.equal(existsSync('frontend/assets/icons/aizanoi-flowerseller.svg'), false);
  for (const path of ['frontend/js/v3/brand-platform.js', 'frontend/js/v3/main.js', 'frontend/js/v3/apps/index.md']) {
    assert.doesNotMatch(read(path), /flowerseller/i, path);
  }
  assert.match(read('frontend/js/v3/apps/index.md'), /\(labs\/index\.md\)/);
});

test('offline caches cannot resurrect Flowerseller static assets', () => {
  const worker = read('frontend/service-worker.js');
  assert.match(worker, /'\/js\/v3\/apps\/flowerseller'/);
  assert.match(worker, /'\/assets\/icons\/aizanoi-flowerseller\.svg'/);
  assert.match(worker, /async function networkFirstStatic\(request\)[\s\S]*?isRetiredPath\(new URL\(request\.url\)\.pathname\)/);
  assert.match(worker, /if\(isRetiredPath\(url\.pathname\)\)throw error/);
  assert.match(read('frontend/release.js'), /CACHE: 'aizanoi-os-shell-v4\.6\.1'/);
});
