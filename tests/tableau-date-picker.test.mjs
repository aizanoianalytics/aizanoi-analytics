import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const productDir = join(repoRoot, 'frontend/analytics/tableau/igahranalytics_date_picker');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const readProduct = (name) => readFileSync(join(productDir, name), 'utf8');

const PROD_URL = 'https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/';
const PROD_TREX = 'https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex';
const EXTENSION_ID = 'com.aizanoianalytics.igahranalytics_date_picker';

/** Strip XML comments: documentation prose must not satisfy structural checks. */
const stripComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');

const trexText = (trex, tag) => {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = trex.indexOf(open);
  const end = trex.indexOf(close, start + open.length);
  assert.ok(start >= 0 && end > start, `TREX must contain <${tag}>`);
  return trex.slice(start + open.length, end).trim();
};

test('product files exist: app, config, styles, cores, manifests, docs, screenshots', () => {
  for (const file of [
    'index.html', 'app.js', 'ui.css', 'config.html', 'config.js',
    'core/dates.js', 'core/settings.js', 'core/apply.js', 'core/discovery.js',
    'igahranalytics_date_picker.trex', 'igahranalytics_date_picker.local.trex',
    'icon.png', 'README.md', 'SECURITY.md', 'AUTHOR_GUIDE.md', 'MANUAL_ACCEPTANCE.md',
    'mock-narrow.png', 'mock-wide.png',
    'vendor/tableau.extensions-1.10.0.min.js', 'vendor/LICENSE-tableau-extensions.txt',
  ]) {
    const full = join(productDir, file);
    assert.ok(existsSync(full), `missing product file: ${file}`);
    assert.ok(statSync(full).size > 0, `empty product file: ${file}`);
  }
});

test('extension is static: no external requests, telemetry, storage or row-level data APIs', () => {
  const sources = {
    html: readProduct('index.html'),
    app: readProduct('app.js'),
    configHtml: readProduct('config.html'),
    config: readProduct('config.js'),
    css: readProduct('ui.css'),
    dates: readProduct('core/dates.js'),
    settings: readProduct('core/settings.js'),
    apply: readProduct('core/apply.js'),
    discovery: readProduct('core/discovery.js'),
  };
  for (const [name, src] of Object.entries(sources)) {
    const urls = src.match(/https?:\/\/[^\s'"<>)]+/g) || [];
    const external = urls.filter(
      (u) => !/^https:\/\/aizanoianalytics\.com/.test(u) && !/www\.w3\.org\/2000/.test(u),
    );
    assert.deepEqual(external, [], `${name} must not reference any external URL`);
  }
  const cssUrls = sources.css.match(/url\(([^)]+)\)/g) || [];
  assert.deepEqual(cssUrls, [], 'CSS must not fetch remote assets');
  for (const [name, src] of Object.entries(sources)) {
    assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/, `${name}: no network calls`);
    assert.doesNotMatch(src, /google-analytics|googletagmanager|gtag\s*\(/, `${name}: no telemetry`);
    assert.doesNotMatch(src, /\blocalStorage\b|\bsessionStorage\b|indexedDB|document\.cookie/, `${name}: no browser storage for workbook data`);
    assert.doesNotMatch(
      src,
      /getUnderlyingDataAsync|getUnderlyingTableDataAsync|getUnderlyingTablesAsync|getSummaryDataAsync|getSummaryDataReaderAsync|getLogicalTableDataAsync|getDataSourcesAsync|getConnectionSummariesAsync/,
      `${name}: no row-level or data-source APIs (filter metadata only)`,
    );
  }
});

test('production manifest is a Dashboard Extension with configure menu and no permissions', () => {
  const trex = readProduct('igahranalytics_date_picker.trex');
  assert.match(trex, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(trex, /<manifest manifest-version="0\.1" xmlns="http:\/\/www\.tableau\.com\/xml\/extension_manifest">/);
  const ext = trex.match(/<dashboard-extension id="([^"]+)" extension-version="([^"]+)">/);
  assert.ok(ext, 'must declare a dashboard-extension (NOT worksheet/viz extension)');
  assert.equal(ext[1], EXTENSION_ID);
  assert.match(ext[2], /^\d+\.\d+\.\d+$/);
  assert.doesNotMatch(trex, /<worksheet-extension/);
  assert.equal(trexText(trex, 'min-api-version'), '1.0');
  assert.equal(trexText(trex, 'url'), PROD_URL);
  const xml = stripComments(trex);
  assert.match(xml, /<context-menu>\s*<configure-menu-item title-resource-id="configure" ?\/>\s*<\/context-menu>/,
    'dashboard extension must declare the Configure context-menu item');
  const icon = trexText(xml, 'icon');
  assert.match(icon, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'TREX requires the 70x70 PNG inline as Base64');
  const png = Buffer.from(icon.slice('data:image/png;base64,'.length), 'base64');
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 70, 'inline icon width');
  assert.equal(png.readUInt32BE(20), 70, 'inline icon height');
  assert.match(xml, /<\/dashboard-extension>\s*<resources>/, 'resources must be a root child after dashboard-extension');
  assert.match(xml, /<resource id="configure">[\s\S]*?<text locale="en_US">Configure\.\.\.<\/text>/);
  assert.match(xml, /<text locale="tr_TR">/, 'name resource must ship Turkish');
  assert.match(xml, /<text locale="en_US">/, 'name resource must ship English');
  assert.doesNotMatch(xml, /<permissions>/, 'date-range filtering requests no data permissions');
});

test('local manifest mirrors production shape with a distinct local id and URL', () => {
  const local = readProduct('igahranalytics_date_picker.local.trex');
  const ext = local.match(/<dashboard-extension id="([^"]+)" extension-version="([^"]+)">/);
  assert.ok(ext, 'local manifest must declare a dashboard-extension');
  assert.ok(ext[1].endsWith('.local'), 'local manifest needs its own id');
  assert.notEqual(ext[1], EXTENSION_ID, 'local manifest must not reuse the production extension id');
  assert.equal(trexText(local, 'url'), 'http://127.0.0.1:4173/analytics/tableau/igahranalytics_date_picker/');
  assert.doesNotMatch(stripComments(local), /<permissions>/);
});

test('app uses the vendored pinned SDK and the official 2023.1-compatible filter APIs', () => {
  const html = readProduct('index.html');
  assert.match(html, /src="vendor\/tableau\.extensions-1\.10\.0\.min\.js"/, 'SDK must be vendored locally, never a CDN');
  assert.match(readProduct('config.html'), /src="vendor\/tableau\.extensions-1\.10\.0\.min\.js"/, 'dialog loads the SDK locally too');
  const app = readProduct('app.js');
  assert.match(app, /tableau\.extensions\.initializeAsync\(\{\s*configure:/, 'must register the configure callback');
  assert.match(app, /dashboardContent\.dashboard/, 'must reach the live dashboard object');
  assert.match(app, /\.worksheets/, 'must enumerate dashboard worksheets');
  assert.match(app, /getFiltersAsync\(\)/, 'discovery must read existing filter metadata');
  assert.match(app, /getFieldAsync\(\)/, 'discovery must resolve field types from metadata');
  assert.match(app, /applyRangeFilterAsync\(/, 'must apply per-caption range filters');
  assert.match(app, /NonNullValues/, 'range filters must exclude nulls explicitly');
  assert.match(app, /clearFilterAsync\(/, 'reset must clear mapped filters');
  assert.match(app, /displayDialogAsync\(/, 'gear opens the mapping dialog');
  assert.doesNotMatch(app, /settings\.set|saveAsync/, 'main app never persists settings; only the config dialog does');
  assert.match(app, /Configure/, 'main gear offers read-only summary plus Configure guidance');
  const config = readProduct('config.js');
  assert.match(config, /settings\.set\(/, 'configuration dialog persists the mapping');
  assert.match(config, /saveAsync\(\)/, 'configuration dialog saves only in authoring mode');
  assert.match(config, /closeDialog\(/, 'dialog closes via the Tableau dialog API');
});

test('vendored SDK is the pinned 1.10.0 build and ships its MIT license', () => {
  const vendor = join(productDir, 'vendor/tableau.extensions-1.10.0.min.js');
  const sdk = readFileSync(vendor, 'utf8');
  assert.ok(sdk.includes('initializeAsync'), 'SDK must expose initializeAsync');
  assert.ok(sdk.includes('tableau.extensions'), 'SDK must build the tableau.extensions namespace');
  const license = readFileSync(join(productDir, 'vendor/LICENSE-tableau-extensions.txt'), 'utf8');
  assert.match(license, /MIT License[\s\S]*Tableau/);
});

test('catalog page gives the date picker a prominent discover/download/use path', () => {
  const catalog = read('frontend/analytics/tableau/index.html');
  for (const label of [
    'igahranalytics_date_picker', 'IGA HR Analytics — Date Picker',
    'Access Local Extensions', 'Configure', 'Apply', 'Reset',
    'Tableau Desktop 2023.1.22', 'corporate',
  ]) {
    assert.ok(catalog.includes(label), `catalog page must document "${label}"`);
  }
  assert.match(catalog, new RegExp(`href="${PROD_TREX.replaceAll('/', '\\/')}"`));
  assert.match(catalog, new RegExp(`href="${PROD_URL.replaceAll('/', '\\/')}"`));
  assert.match(catalog, /manual verification pending/i, 'unvalidated corporate Desktop run must be labeled pending');
});

test('canonical analytics catalog keeps exactly one Tableau set with a date-picker link', () => {
  const catalog = read('frontend/analytics/catalog.js');
  assert.equal((catalog.match(/id:'tableau-extensions'/g) || []).length, 1);
  assert.match(catalog, /igahranalytics_date_picker/);
  assert.match(catalog, /\/analytics\/tableau\/igahranalytics_date_picker\//);
});

test('product docs carry the exact live URLs and the honest validation state', () => {
  for (const file of ['README.md', 'AUTHOR_GUIDE.md']) {
    const doc = readProduct(file);
    assert.ok(doc.includes(PROD_URL), `${file} must carry the exact hosted app URL`);
    assert.ok(doc.includes(PROD_TREX), `${file} must carry the exact TREX download URL`);
  }
  assert.match(readProduct('README.md'), /2023\.1\.22/);
  assert.match(readProduct('README.md'), /pending manual/i);
  const manual = readProduct('MANUAL_ACCEPTANCE.md');
  assert.match(manual, /manual verification pending/i);
  assert.match(manual, /2023\.1\.22/);
  const security = readProduct('SECURITY.md');
  assert.match(security, /synthetic/i);
  assert.match(security, /No full-data permission|no .*full data/i);
});

test('mock screenshots are real labeled captures, not placeholders', () => {
  for (const shot of ['mock-narrow.png', 'mock-wide.png']) {
    const full = join(productDir, shot);
    assert.ok(existsSync(full), `${shot} must be committed`);
    const bytes = readFileSync(full);
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${shot} must be a real PNG`);
    assert.ok(bytes.length > 20000, `${shot} must be a real capture, not a blank image`);
  }
});
