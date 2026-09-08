// Regression tests for the 2026-09-08 independent a11y/mobile-contrast audits.
// Each test asserts the public artifact contract, not implementation details.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('PACS form controls have programmatic labels via for/id pairs', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/pacs/index.html');
  const ids = ['orgFilter', 'searchFilter', 'personSearch', 'personSelect', 'orgSearchInput', 'orgSelectDetail', 'orgStaffSelect'];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
    assert.match(html, new RegExp(`id="${id}"`), `control #${id} missing`);
  }
});

test('PACS toolbar fill-mode can shrink below 320px on narrow viewports', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/pacs/index.html');
  assert.doesNotMatch(html, /\.toolbar \.fill-mode\{[^}]*min-width:320px/);
  assert.match(html, /\.toolbar \.fill-mode\{[^}]*min-width:0/);
});

test('Recycle Bin empty state is a valid listitem inside the role=list container', () => {
  const js = read('frontend/js/v3/apps/recycle-bin/src/app.js');
  assert.match(js, /class="az-empty-state" role="listitem"/);
});

test('Calculator memory indicator declares a status role for its aria-label', () => {
  const js = read('frontend/js/v3/apps/calculator/src/app.js');
  assert.match(js, /data-calc-memory-indicator role="status" aria-label="Memory status"/);
});

test('Shell muted metric color meets WCAG AA on its light background', () => {
  const css = read('frontend/styles/shell.css');
  const block = css.match(/\.az-analytics-set-metrics span \{[^}]*\}/);
  assert.ok(block, 'set-metrics span rule missing');
  assert.match(block[0], /color:#596579/);
  assert.doesNotMatch(block[0], /color:#68758a/);
});

test('Shell email micro typography stays at or above the 11px floor', () => {
  const css = read('frontend/styles/shell.css');
  const block = css.match(/\.az-aizo-email \{[^}]*\}/);
  assert.ok(block, 'az-aizo-email rule missing');
  assert.doesNotMatch(block[0], /font:600 10px/);
  assert.match(block[0], /font:600 11px/);
});

test('Recruitment muted token meets WCAG AA on slate-50 surfaces', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html');
  const token = html.match(/--slate-500:\s*(#[0-9a-fA-F]{6})/);
  assert.ok(token, 'missing --slate-500 token');
  const hex = token[1].slice(1);
  const lum = (h) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(parseInt(hex.slice(0, 2), 16)) + 0.7152 * f(parseInt(hex.slice(2, 4), 16)) + 0.0722 * f(parseInt(hex.slice(4, 6), 16));
  };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const f8fafc = 0.2126 * 0.947307 + 0.7152 * 0.956233 + 0.0722 * 0.979347; // luminance of #f8fafc
  assert.ok(ratio(lum(hex), f8fafc) >= 4.5, `--slate-500 ${token[1]} on #f8fafc is ${ratio(lum(hex), f8fafc).toFixed(2)}:1, needs >= 4.5`);
});

test('Recruitment status pills use WCAG AA dark accents on their tinted backgrounds', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html');
  for (const name of ['blue', 'green', 'amber', 'red', 'violet']) {
    assert.match(html, new RegExp(`--${name}-700:`), `missing --${name}-700 token`);
    assert.match(html, new RegExp(`\\.pill-${name} \\{ background: var\\(--${name}-100\\); color: var\\(--${name}-700\\); \\}`));
  }
  assert.doesNotMatch(html, /\.pill-blue \{ background: var\(--blue-100\); color: var\(--blue-600\); \}/);
});

test('Recruitment mobile media block targets the real nav container', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html');
  assert.match(html, /@media \(max-width: 820px\) \{[\s\S]*?\.nav-tabs-container \{ width: 100%; max-width: 100%; overflow-x: auto;/);
});

test('Recruitment grid children and trend chart cannot force page-level overflow', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html');
  assert.match(html, /\.dashboard-grid-2 > \*,\n\.dashboard-grid-3 > \*,\n\.card \{\n  min-width: 0;\n\}/);
  const trend = html.match(/\.trend-chart \{[\s\S]*?\n\}/);
  assert.ok(trend, 'trend-chart rule missing');
  assert.match(trend[0], /overflow-x: auto/);
});

test('Executive board English runtime maps audited Turkish residuals to English', () => {
  const overrides = JSON.parse(read('scripts/hr/hr-public-en-overrides.json'));
  const values = overrides.values || {};
  const expected = {
    'Tüm Yıl': 'Full Year',
    'Ort. Çalışan': 'Avg. Employees',
    'Filtreleri Temizle': 'Clear Filters',
    'Doldurma Grubu': 'Fill Bucket',
    'Medyan': 'Median',
    'filtreli kayıt': 'filtered records',
    'filtreli tüm atamalar': 'filtered assignments',
    'Düşük örneklem': 'Low sample',
    'Ort. Gün': 'Avg. Days',
  };
  for (const [source, target] of Object.entries(expected)) {
    assert.equal(values[source], target, `override missing: ${source} -> ${target}`);
  }
});

test('English localizer translates numbered filtered-record captions', () => {
  const src = read('scripts/hr/localize-public-dashboard-en.mjs');
  assert.ok(src.includes('filtreli kay'), 'numbered filtreli-kayit pattern missing from localizer');
  assert.ok(src.includes('filtered records'), 'English filtered-records rendering missing from localizer');
});

test('Generated executive boards carry no lang=tr attribute or setter', () => {
  const template = read('analytics/dashboards/hr-analytics-full-set/production-pipeline/aylik_sunum.html');
  assert.doesNotMatch(template, /lang="tr" at|select lang="tr"/);
  assert.match(template, /<html lang="tr">/); // document root stays tr-TR in the parity-preserved source; the decorator rewrites it
  assert.doesNotMatch(template, /select id="[a-z0-9-]+" class="select" lang="tr"/);
  assert.doesNotMatch(template, /setAttribute\("lang", "tr"\)/);
});

test('Worlds browser smoke allows the observed slow controls-enable path', () => {
  const src = read('tests/worlds-browser-smoke.mjs');
  assert.match(src, /controlsEnabled===true,null,\{timeout:10000\}\)/);
  assert.doesNotMatch(src, /controlsEnabled===true,null,\{timeout:5000\}\)/);
});
