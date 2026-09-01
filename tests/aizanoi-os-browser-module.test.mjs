import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/browser';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const styles = read(`${moduleRoot}/assets/browser.css`);

test('Browser is a zero-capability manifest-driven desktop app', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'browser');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Browser only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const browser = registry.appById('browser');
  assert.equal(browser?.module, '/js/v3/apps/browser/src/index.js');
  assert.deepEqual([...browser.requires], []);
  assert.equal(existsSync('frontend/js/v3/apps/browser.js'), false, 'flat Browser entry must not exist');
  const publicEntry = await import('../frontend/js/v3/apps/browser/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Browser normalizes navigation to HTTPS or a safe search URL', async () => {
  const { resolveBrowserInput } = await import('../frontend/js/v3/apps/browser/src/app.js');
  assert.equal(resolveBrowserInput('example.com'), 'https://example.com/');
  assert.equal(resolveBrowserInput('http://example.com/docs'), 'https://example.com/docs');
  assert.equal(resolveBrowserInput('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.match(resolveBrowserInput('aizanoi analytics') || '', /^https:\/\/www\.google\.com\/search\?igu=1&q=aizanoi%20analytics$/);
  assert.match(resolveBrowserInput('javascript:alert(1)') || '', /^https:\/\/www\.google\.com\/search\?/);
  assert.equal(resolveBrowserInput('   '), null);
});

test('Browser keeps destinations on an opaque sandbox origin and blocks top-level navigation', () => {
  assert.match(privateApp, /sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"/);
  assert.doesNotMatch(privateApp, /allow-same-origin|allow-top-navigation/);
  assert.match(privateApp, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
  assert.doesNotMatch(privateApp, /proxy_pass|fetch\(.*https?:\/\//s);
});

test('Browser uses iframe-compatible Google URLs while preserving an external fallback', () => {
  assert.match(privateApp, /https:\/\/www\.google\.com\/webhp\?igu=1/);
  assert.match(privateApp, /https:\/\/www\.google\.com\/search\?igu=1&q=/);
  assert.match(privateApp, /data-browser-external/);
  assert.match(privateApp, /data-browser-site-home/);
});

test('Browser tells users that remote requests are direct and not proxied by Aizanoi', () => {
  assert.match(privateApp, /Direct browser connection · no Aizanoi proxy/i);
  assert.match(privateApp, /requested directly by your browser/i);
  assert.match(privateApp, /does not proxy or relay them/i);
});

test('Browser owns responsive external styles and hidden-state behavior', () => {
  assert.match(privateApp, /\/js\/v3\/apps\/browser\/assets\/browser\.css/);
  assert.match(styles, /\.az-browser-shell \[hidden\]\s*\{\s*display:none !important;/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /@media \(max-width:430px\)/);
});

test('Browser cleanup removes owned listeners, frame content and stylesheet reference', () => {
  assert.match(privateApp, /removeEventListener\('submit', handleSubmit\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('load', handleFrameLoad\)/);
  assert.match(privateApp, /frame\.removeAttribute\('src'\)/);
  assert.match(privateApp, /releaseStylesheet\(\)/);
});
