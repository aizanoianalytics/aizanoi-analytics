import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = 'analytics/dashboards/hr-analytics-full-set/workforce-turnover';
const publicRoot = 'frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover';
const pagePath = `${publicRoot}/index.html`;
const workbookPath = `${root}/data/turnover_analytics_synthetic.xlsx`;
const templatePath = `${root}/turnover_dashboard_template.py`;
const generatorPath = `${root}/generate_turnover_dashboard.py`;
const commonPath = `${root}/turnover_analytics_common.py`;
const readmePath = `${root}/README.md`;

const html = readFileSync(pagePath, 'utf8');
const app = readFileSync(`${publicRoot}/app.js`, 'utf8');
const template = readFileSync(templatePath, 'utf8');
const generator = readFileSync(generatorPath, 'utf8');
const readme = readFileSync(readmePath, 'utf8');
const payloadMatch = html.match(/<div id="turnover-data" hidden>([\s\S]*?)<\/div>/);
assert.ok(payloadMatch, 'embedded turnover payload missing');
const data = JSON.parse(payloadMatch[1]);

function unpack(block) {
  return block.rows.map((values) => Object.fromEntries(block.columns.map((column, index) => [
    column,
    Object.hasOwn(block.dictionaries, column) ? block.dictionaries[column][values[index]] : values[index],
  ])));
}

const monthly = unpack(data.monthly);
const exits = unpack(data.exits);
const riskPeople = unpack(data.risk_people);

test('full standalone engine and synthetic workbook are published', () => {
  for (const file of [pagePath, `${publicRoot}/app.js`, `${publicRoot}/style.css`, workbookPath, templatePath, generatorPath, commonPath, readmePath]) {
    assert.ok(existsSync(file), `${file} missing`);
  }
  assert.ok(readFileSync(workbookPath).byteLength > 500_000, 'workbook is unexpectedly small');
  assert.match(readme, /not an anonymized, masked, sampled, or transformed employer workbook/i);
  assert.match(html, /Synthetic Workforce Lab/i);
});

test('all eight original analytical views and controls remain available', () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs.slice(0, 8), ['overview', 'breakdown', 'compare', 'forecast', 'early', 'exits', 'v2', 'settings']);
  for (const id of [
    'scope-filter', 'type-filter', 'start-filter', 'end-filter', 'region-filter', 'store-filter',
    'department-filter', 'city-filter', 'gender-filter', 'contract-filter', 'title-filter',
    'scope-trend-chart', 'breakdown-heatmap', 'title-matrix-table', 'comparison-chart',
    'forecast-chart', 'annual-backtest-table', 'tenure-chart', 'exit-table', 'survival-chart',
    'risk-entities', 'risk-people', 'reason-list',
  ]) assert.match(html, new RegExp(`id="${id}"`), `${id} missing`);
  for (const exportName of ['trend', 'breakdown', 'title-matrix', 'comparison', 'exits']) {
    assert.match(html, new RegExp(`data-export="${exportName}"`), `${exportName} export missing`);
  }
});

test('synthetic workbook payload is deep enough to exercise every feature', () => {
  assert.equal(data.meta.month_count, 36);
  assert.equal(data.meta.monthly_row_count, 9_936);
  assert.equal(data.meta.exit_row_count, 849);
  assert.deepEqual(data.meta.scopes, ['Aizanoi Demo Group', 'Retail', 'Retail Part-Time', 'Retail Full-Time', 'Head Office', 'Operations']);
  for (const key of ['forecasts', 'backtest_summary', 'backtest_detail', 'annual_backtest', 'regrettable', 'regrettable_detail', 'survival_curve', 'survival_summary', 'risk_regions', 'risk_stores']) {
    assert.ok(data[key].rows?.length || data[key].length, `${key} is empty`);
  }
  assert.equal(riskPeople.length, 360);
});

test('headcount arithmetic and synthetic exit detail reconcile', () => {
  for (const row of monthly) {
    assert.equal(row.donem_basi + row.giris - row.cikis, row.donem_sonu);
    assert.equal(row.ortalama_calisan, (row.donem_basi + row.donem_sonu) / 2);
  }
  assert.equal(monthly.reduce((sum, row) => sum + row.cikis, 0), exits.reduce((sum, row) => sum + row.cikis, 0));
});

test('every person-like record is explicitly synthetic', () => {
  for (const row of exits) {
    assert.match(row.sicil_no, /^SYN-EMP-\d{6}$/);
    assert.match(row.adi_soyadi, /^Synthetic Employee \d{6}$/);
    assert.match(row.reason_match_status, /^Source list · synthetic match$/);
  }
  for (const row of riskPeople) {
    assert.match(row.sicil_no, /^SYN-RISK-\d{5}$/);
    assert.match(row.adi_soyadi, /^Synthetic Employee R\d{5}$/);
  }
});

test('public source preserves the canonical calculation and offline build path', () => {
  assert.match(template, /function cumulative\(series\)/);
  assert.match(template, /series\.reduce\(\(sum,row\)=>sum\+n\(row\.cikis\),0\)\/denominator/);
  assert.match(template, /localStorage\.setItem/);
  assert.match(template, /csvDownload/);
  assert.match(generator, /pd\.ExcelFile\(xlsx_path\)/);
  assert.match(generator, /Turnover_Analiz_Aylik/);
  assert.match(generator, /V2_Survival_Curve/);
  assert.doesNotMatch(generator, /requests|urllib|socket|os\.environ|dotenv/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(app, /\sstyle=/i);
  assert.match(app, /toLocaleLowerCase\("en-US"\)\.startsWith\("source list"\)/);
});

test('former identity and contact-shaped data are absent from public assets', () => {
  const combined = [html, template, generator, readme].join('\n');
  assert.doesNotMatch(combined, /ipekyol|erduran/i);
  assert.doesNotMatch(combined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(combined, /\b(?:\+?90)?5\d{9}\b/);
});
