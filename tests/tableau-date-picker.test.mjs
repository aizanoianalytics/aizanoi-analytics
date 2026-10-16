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
const EXTENSION_ID = 'com.aizanoianalytics.igahranalytics.datepicker';
const LOCAL_EXTENSION_ID = 'com.aizanoianalytics.igahranalytics.datepicker.local';

/** Strip XML comments: documentation prose must not satisfy structural checks. */
const stripComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');

/**
 * Tableau manifest XSD rules, transcribed from real FD722608 errors on
 * Desktop 2023.1.22 (issue #362) and the official manifest/configure docs:
 * - dashboard-extension id MUST match [A-Za-z]{2,6}(\.[A-Za-z0-9-]{1,63})+
 *   (underscores forbidden);
 * - dashboard-extension children are ORDERED: default-locale, name,
 *   description, author, min-api-version, source-location, icon,
 *   [permissions], [context-menu], [layout];
 * - <context-menu> holds exactly one <configure-context-menu-item /> with
 *   NO attributes; <configure-menu-item> and title-resource-id do not exist;
 * - <icon> is BARE Base64 of a 70x70 PNG (no data: URI prefix);
 * - every resource-id reference resolves; no orphaned <resource> survives.
 * Returns an array of violation strings (empty = valid).
 */
const ID_PATTERN = /^[A-Za-z]{2,6}(\.[A-Za-z0-9-]{1,63})+$/;
const CHILD_ORDER = ['default-locale', 'name', 'description', 'author', 'min-api-version',
  'source-location', 'icon', 'permissions', 'context-menu', 'layout'];

const validateManifest = (label, trex) => {
  const errors = [];
  const xml = stripComments(trex);
  if (!/^<\?xml version="1\.0" encoding="utf-8"\?>/.test(xml)) errors.push('missing XML declaration');
  if (!/<manifest manifest-version="0\.1" xmlns="http:\/\/www\.tableau\.com\/xml\/extension_manifest">/.test(xml)) {
    errors.push('manifest root/namespace wrong');
  }
  const ext = xml.match(/<dashboard-extension id="([^"]+)" extension-version="([^"]+)">([\s\S]*?)<\/dashboard-extension>/);
  if (!ext) { errors.push('missing dashboard-extension block'); return errors; }
  const [, id, version, inner] = ext;
  if (!ID_PATTERN.test(id)) errors.push(`id "${id}" violates Tableau reverse-domain pattern`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version "${version}" is not semver`);
  if (/<worksheet-extension/.test(xml)) errors.push('must be dashboard-extension, not worksheet-extension');
  const tags = [...inner.matchAll(/<([a-z-]+)(?=[\s/>])/g)].map((m) => m[1])
    .filter((t) => t !== 'url' && t !== 'configure-context-menu-item');
  const unknown = tags.filter((t) => !CHILD_ORDER.includes(t));
  if (unknown.length) errors.push(`unknown dashboard-extension children: ${[...new Set(unknown)].join(',')}`);
  const order = [...new Set(tags.filter((t) => CHILD_ORDER.includes(t)))];
  const sorted = [...order].sort((a, b) => CHILD_ORDER.indexOf(a) - CHILD_ORDER.indexOf(b));
  if (order.join(',') !== sorted.join(',')) errors.push(`children out of Tableau order: ${order.join(',')}`);
  if (/<permissions>/.test(inner)) errors.push('must not request data permissions');
  if (/<configure-menu-item/.test(inner)) errors.push('<configure-menu-item> is not a Tableau element');
  if (/title-resource-id/.test(inner)) errors.push('title-resource-id is not a Tableau attribute');
  const cm = inner.match(/<context-menu>([\s\S]*?)<\/context-menu>/);
  if (cm && cm[1].trim() !== '<configure-context-menu-item />') {
    errors.push('<context-menu> must hold exactly <configure-context-menu-item />');
  }
  const icon = (inner.match(/<icon>([\s\S]*?)<\/icon>/) || [])[1];
  if (icon === undefined) errors.push('missing <icon>');
  else if (/^\s*data:/.test(icon) || icon.includes(',')) errors.push('<icon> must be bare Base64, not a data URI');
  else {
    let png;
    try { png = Buffer.from(icon.trim(), 'base64'); } catch { png = null; }
    if (!png || png.toString('ascii', 1, 4) !== 'PNG') errors.push('<icon> is not decodable PNG bytes');
    else if (png.readUInt32BE(16) !== 70 || png.readUInt32BE(20) !== 70) {
      errors.push('<icon> PNG is not 70x70');
    }
  }
  const refs = [...xml.matchAll(/resource-id="([^"]+)"/g)].map((m) => m[1]);
  const defs = [...xml.matchAll(/<resource id="([^"]+)">/g)].map((m) => m[1]);
  for (const r of refs) if (!defs.includes(r)) errors.push(`resource-id "${r}" has no <resource>`);
  for (const d of defs) if (!refs.includes(d)) errors.push(`orphaned <resource id="${d}"> (remove unused resources)`);
  if (!/<\/dashboard-extension>\s*<resources>/.test(xml)) errors.push('resources must follow dashboard-extension');
  return errors;
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

test('production manifest passes Tableau XSD rules (FD722608 regression, issue #362)', () => {
  const trex = readProduct('igahranalytics_date_picker.trex');
  assert.deepEqual(validateManifest('prod', trex), [], 'production TREX must be Tableau-valid');
  const xml = stripComments(trex);
  assert.match(xml, new RegExp(`<dashboard-extension id="${EXTENSION_ID.replaceAll('.', '\\.')}"`));
  assert.match(xml, /<text locale="tr_TR">/, 'name resource must ship Turkish');
  assert.match(xml, /<text locale="en_US">/, 'name resource must ship English');
  const url = xml.match(/<source-location>\s*<url>([^<]+)<\/url>/);
  assert.ok(url, 'source-location url required');
  assert.equal(url[1].trim(), PROD_URL);
});

test('local manifest is independently Tableau-valid with a distinct local id', () => {
  const local = readProduct('igahranalytics_date_picker.local.trex');
  assert.deepEqual(validateManifest('local', local), [], 'local TREX must be Tableau-valid');
  const ext = stripComments(local).match(/<dashboard-extension id="([^"]+)"/);
  assert.equal(ext[1], LOCAL_EXTENSION_ID);
  assert.notEqual(ext[1], EXTENSION_ID);
  assert.match(local, /<url>http:\/\/127\.0\.0\.1:4173\/analytics\/tableau\/igahranalytics_date_picker\/<\/url>/);
});

test('manifest validator rejects each FD722608 defect class (negative fixtures)', () => {
  const good = readProduct('igahranalytics_date_picker.trex');
  const base = stripComments(good);
  const iconB64 = base.match(/<icon>([\s\S]*?)<\/icon>/)[1].trim();
  const cases = [
    ['underscore id', (x) => x.replace(EXTENSION_ID, 'com.aizanoianalytics.igahranalytics_date_picker'), /reverse-domain/],
    ['wrong configure tag', (x) => x.replace('<configure-context-menu-item />', '<configure-menu-item title-resource-id="configure" />'), /not a Tableau element/],
    ['data-URI icon', (x) => x.replace(`<icon>${iconB64}`, '<icon>data:image/png;base64,' + iconB64), /bare Base64/],
    ['context-menu before icon', (x) => {
      const cm = x.match(/<context-menu>[\s\S]*?<\/context-menu>\s*/)[0];
      return x.replace(cm, '').replace(/(<source-location>[\s\S]*?<\/source-location>\s*)/, `$1${cm}`);
    }, /out of Tableau order/],
    ['orphaned resource', (x) => x.replace(/<\/resources>/, '<resource id="stale"><text locale="en_US">Stale</text></resource>\n</resources>'), /orphaned/],
    ['full-data permission', (x) => x.replace('</icon>', '</icon>\n<permissions><permission>full data</permission></permissions>'), /must not request data permissions/],
  ];
  for (const [label, mutate, expected] of cases) {
    const violations = validateManifest(label, mutate(base));
    assert.ok(violations.length > 0, `fixture "${label}" must fail validation`);
    assert.match(violations.join('; '), expected, `fixture "${label}" must fail for the right reason`);
  }
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
