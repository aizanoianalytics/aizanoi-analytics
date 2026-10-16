import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const helloDir = join(repoRoot, 'frontend/analytics/tableau/hello');

const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

/** Extract a single element's text content from the small, known TREX file. */
const trexText = (trex, tag) => {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = trex.indexOf(open);
  const end = trex.indexOf(close, start + open.length);
  assert.ok(start >= 0 && end > start, `TREX must contain <${tag}>`);
  return trex.slice(start + open.length, end).trim();
};

test('pilot app is static: no external requests, no frameworks, no telemetry', () => {
  const html = read('frontend/analytics/tableau/hello/index.html');
  const js = read('frontend/analytics/tableau/hello/app.js');
  const css = read('frontend/analytics/tableau/hello/style.css');

  // Third-party / remote resources are forbidden by the brief and SECURITY.md.
  for (const [name, src] of [['html', html], ['js', js], ['css', css]]) {
    const urls = src.match(/https?:\/\/[^\s'"<>)]+/g) || [];
    const external = urls.filter((u) => !/^https:\/\/aizanoianalytics\.com/.test(u) && !/www\.w3\.org\/2000/.test(u));
    assert.deepEqual(external, [], `${name} must not reference any external URL`);
  }
  const cssUrls = css.match(/url\(([^)]+)\)/g) || [];
  assert.deepEqual(cssUrls, [], 'CSS must not fetch remote assets');
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/,
    'pilot must not make network requests');
  assert.doesNotMatch(js, /google-analytics|googletagmanager|analytics\.js|gtag\s*\(/,
    'no analytics or pixels');
});

test('manifest is a Dashboard Extension with a pinned compatible API version', () => {
  const trex = read('frontend/analytics/tableau/hello/aizanoi-hello.trex');
  assert.match(trex, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(trex, /<manifest manifest-version="0\.1" xmlns="http:\/\/www\.tableau\.com\/xml\/extension_manifest">/);

  const ext = trex.match(/<dashboard-extension id="([^"]+)" extension-version="([^"]+)">/);
  assert.ok(ext, 'must declare a dashboard-extension (NOT worksheet/viz extension)');
  assert.equal(ext[1], 'com.aizanoianalytics.tableau.hello');
  assert.match(ext[2], /^\d+\.\d+\.\d+$/);
  assert.doesNotMatch(trex, /<worksheet-extension/);

  const apiVersion = trexText(trex, 'min-api-version');
  // 1.0 keeps the manifest loadable by every Tableau that supports dashboard
  // extensions (Desktop 2018.2+, which covers the corporate 2023.1 machine).
  // The vendored library itself is pinned at 1.10.0; newer manifest minimums
  // (1.11+ / 2024.1+ / 2024.2+) would exclude supported versions unnecessarily.
  assert.equal(apiVersion, '1.0');

  const url = trexText(trex, 'url');
  assert.equal(url, 'https://aizanoianalytics.com/analytics/tableau/hello/');
});

test('manifest declares inline 70x70 PNG, root resources and no data permissions', () => {
  const trex = read('frontend/analytics/tableau/hello/aizanoi-hello.trex');
  // Strip XML comments before structural checks: documentation prose inside
  // comments is not schema content.
  const xml = trex.replace(/<!--[\s\S]*?-->/g, '');
  const icon = trexText(xml, 'icon');
  assert.match(icon, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
    'Tableau TREX requires the 70x70 PNG inline as Base64');
  const png = Buffer.from(icon.slice('data:image/png;base64,'.length), 'base64');
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 70, 'inline icon width');
  assert.equal(png.readUInt32BE(20), 70, 'inline icon height');
  assert.match(xml, /<\/dashboard-extension>\s*<resources>/,
    'resources must be a root child after dashboard-extension');
  assert.match(xml, /<resource id="name">\s*<text locale="en_US">Aizanoi Hello — Tableau Connectivity Test<\/text>\s*<\/resource>/,
    'name resource must contain localized text');
  assert.doesNotMatch(xml, /<permissions>/,
    'a connectivity test requests no data permissions');
});

test('app uses the vendored pinned SDK and initializes with initializeAsync', () => {
  const html = read('frontend/analytics/tableau/hello/index.html');
  assert.match(html, /src="vendor\/tableau\.extensions-1\.10\.0\.min\.js"/,
    'SDK must be vendored locally, never loaded from a CDN');
  const js = read('frontend/analytics/tableau/hello/app.js');
  assert.match(js, /tableau\.extensions\.initializeAsync\(\)/);
  assert.match(js, /\.then\(/, 'success path must render the connected state');
  assert.match(js, /\.catch\(/, 'failure path must render an error with retry');
});

test('app distinguishes Demo (browser) from Tableau connected state', () => {
  const js = read('frontend/analytics/tableau/hello/app.js');
  assert.match(js, /typeof tableau === 'undefined'/,
    'browser-only load must detect the absent SDK');
  assert.match(js, /Demo \/ Tableau not detected/);
  assert.match(js, /Tableau connected/);
  // Demo must not pretend to have talked to Tableau.
  assert.doesNotMatch(js, /demoConnected/);
});

test('app reads nothing from Tableau: no data, settings, filter or layout access', () => {
  const js = read('frontend/analytics/tableau/hello/app.js');
  for (const forbidden of [
    'getUnderlyingDataAsync', 'getSummaryDataAsync', 'getUnderlyingTablesAsync',
    'getSummaryDataReaderAsync', 'getDataSourcesAsync', 'getActiveTablesAsync',
    'getConnectionSummariesAsync', 'getLogicalTablesAsync', 'getLogicalTableDataAsync',
    'applyFilterAsync', 'getFiltersAsync', 'getWorksheetsAsync',
    'displayDialogAsync', 'settings.set', 'ui.displayUi',
    '.dashboardContent.dashboard.name',
  ]) {
    assert.ok(!js.includes(forbidden), `pilot must not use ${forbidden}`);
  }
});

test('catalog page documents privacy, install, requirements and source links', () => {
  const catalog = read('frontend/analytics/tableau/index.html');
  for (const label of [
    'Privacy &amp; Security', 'How to Install', 'Requirements',
    'Version', 'Source code', 'no real corporate data', 'dummy',
  ]) {
    assert.ok(catalog.includes(label), `catalog page must document "${label}"`);
  }
  assert.match(catalog, /No data access/i);
  assert.match(catalog, /No telemetry/i);
  assert.match(catalog, /No third-party requests/i);
  assert.match(catalog, /Access Local Extensions/,
    'install instructions must match the corporate Tableau 2023.1 flow');
});

test('catalog page links the manifest and the hosted app with absolute URLs', () => {
  const catalog = read('frontend/analytics/tableau/index.html');
  assert.match(catalog, /href="https:\/\/aizanoianalytics\.com\/analytics\/tableau\/hello\/aizanoi-hello\.trex"/);
  assert.match(catalog, /href="https:\/\/aizanoianalytics\.com\/analytics\/tableau\/hello\/"/);
});

test('canonical analytics catalog keeps one Tableau entry', () => {
  const catalog = read('frontend/analytics/catalog.js');
  assert.match(catalog, /id:'tableau-extensions'/);
  assert.match(catalog, /\/analytics\/tableau\//);
});

test('vendored SDK is the pinned 1.10.0 build and ships its MIT license', () => {
  const vendor = join(helloDir, 'vendor/tableau.extensions-1.10.0.min.js');
  assert.ok(existsSync(vendor), 'vendored SDK must exist');
  const sdk = readFileSync(vendor, 'utf8');
  // The minified bundle defines the tableau.extensions namespace and the
  // initializeAsync entry point used by the pilot.
  assert.ok(sdk.includes('initializeAsync'), 'SDK must expose initializeAsync');
  assert.ok(sdk.includes('tableau.extensions'), 'SDK must build the tableau.extensions namespace');
  const license = join(helloDir, 'vendor/LICENSE-tableau-extensions.txt');
  assert.ok(existsSync(license), 'MIT license must ship with the vendored SDK');
  assert.match(readFileSync(license, 'utf8'), /MIT License[\s\S]*Tableau/);
});
