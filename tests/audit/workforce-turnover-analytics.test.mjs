import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const pipelineRoot = 'analytics/dashboards/hr-analytics-full-set/production-pipeline';
const publicRoot = 'frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover';
const html = readFileSync(`${publicRoot}/index.html`, 'utf8');
const template = readFileSync(`${pipelineRoot}/turnover_dashboard_template.py`, 'utf8');
const generator = readFileSync(`${pipelineRoot}/generate_turnover_dashboard.py`, 'utf8');
const common = readFileSync(`${pipelineRoot}/turnover_analytics_common.py`, 'utf8');
const readme = readFileSync('analytics/dashboards/hr-analytics-full-set/workforce-turnover/README.md', 'utf8');

test('original generator, template and integrated synthetic output are published', () => {
  for (const file of [`${publicRoot}/index.html`, `${pipelineRoot}/turnover_dashboard_template.py`, `${pipelineRoot}/generate_turnover_dashboard.py`, `${pipelineRoot}/turnover_analytics_common.py`, `${pipelineRoot}/dashboardlar/icmal_sorgu_sonuc.xlsx`]) {
    assert.ok(existsSync(file), `${file} missing`);
  }
  assert.ok(statSync(`${publicRoot}/index.html`).size > 200_000);
  assert.ok(statSync(`${pipelineRoot}/dashboardlar/icmal_sorgu_sonuc.xlsx`).size > 5_000_000);
  assert.match(readme, /original turnover analytics engine/i);
});

test('all eight original analytical views and controls remain available', () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs.slice(0, 8), ['overview', 'breakdown', 'compare', 'forecast', 'early', 'exits', 'v2', 'settings']);
  for (const id of ['scope-filter','type-filter','start-filter','end-filter','region-filter','store-filter','department-filter','city-filter','gender-filter','contract-filter','title-filter','scope-trend-chart','breakdown-heatmap','title-matrix-table','comparison-chart','forecast-chart','annual-backtest-table','tenure-chart','exit-table','survival-chart','risk-entities','risk-people','reason-list']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} missing`);
  }
  for (const name of ['trend','breakdown','title-matrix','comparison','exits']) assert.match(html, new RegExp(`data-export="${name}"`));
});

test('forecast, backtest, survival and risk contracts remain present', () => {
  for (const marker of ['Sadece_Tahmin_Aylari','Tahmin_Backtest_Ozet','Tahmin_Backtest_Detay','Tahmin_Yillik_Backtest','V2_Regrettable_Turnover','V2_Survival_Curve','riski_yuksek_bolgeler','riski_yuksek_magazalar','Magaza_ML_risk']) {
    assert.match(`${generator}\n${html}`, new RegExp(marker), `${marker} missing`);
  }
  assert.match(html, /Synthetic Employee/);
  assert.match(html, /Aurelia|Borealis|Cyrene/);
});

test('canonical calculations, local settings and exports remain in source', () => {
  const source = `${template}\n${generator}\n${common}`;
  assert.match(source, /function cumulative\(series\)/);
  assert.match(source, /series\.reduce\(\(sum,row\)=>sum\+n\(row\.cikis\),0\)\/denominator/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /csvDownload/);
  assert.match(generator, /pd\.ExcelFile\(xlsx_path\)/);
  assert.match(generator, /Turnover_Analiz_Aylik/);
  assert.match(generator, /V2_Survival_Curve/);
  assert.doesNotMatch(generator, /requests|urllib|socket|os\.environ|dotenv/i);
});

test('former identities and real contact-shaped values are absent', () => {
  const combined = `${html}\n${template}\n${generator}\n${common}\n${readme}`;
  assert.doesNotMatch(combined, /ipekyol|erduran/i);
  for (const email of combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) assert.match(email, /@example\.test$/i);
  assert.doesNotMatch(combined, /\b(?:\+?90)?5\d{9}\b/);
});
