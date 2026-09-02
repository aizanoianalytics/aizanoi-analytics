import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicDashboards = [
  'frontend/analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/pdks_takip_dashboard.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/pdks_takip_dashboard.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover/index.html',
];

const pipeline = resolve('analytics/dashboards/hr-analytics-full-set/production-pipeline');
const outputs = resolve(pipeline, 'dashboardlar');
const internalWorkbookNames = new Set(['icmal_sorgu_sonuc.xlsx']);
for (const directory of [pipeline, outputs]) {
  for (const entry of readdirSync(directory, { withFileTypes:true })) {
    if (entry.isFile() && /\.xlsx$/i.test(entry.name)) internalWorkbookNames.add(entry.name);
  }
}

const prohibitedEntities = [
  { label:'Arvato vendor identifier', pattern:/\bArvato\b/i },
];

test('public generated HR dashboards contain no prohibited vendor identifiers or exact internal workbook basenames', () => {
  for (const file of publicDashboards) {
    const html = readFileSync(file, 'utf8');
    for (const rule of prohibitedEntities) {
      assert.doesNotMatch(html, rule.pattern, `${file} exposes ${rule.label}`);
    }
    for (const workbook of internalWorkbookNames) {
      assert.equal(html.toLocaleLowerCase('en-US').includes(workbook.toLocaleLowerCase('en-US')), false, `${file} exposes internal workbook ${workbook}`);
    }
    assert.doesNotMatch(html, /"source_file"\s*:\s*"[^"]*\.xlsx"/i, `${file} exposes source_file workbook metadata`);
    assert.doesNotMatch(html, /"(?:source|fiili_source)"\s*:\s*"[^"]*\.xlsx"/i, `${file} exposes source workbook metadata`);
  }
});

test('HR public sanitization boundary discovers workbook basenames and declares the prohibited entity class it removes', () => {
  const sanitizer = readFileSync('scripts/hr/sanitize-public-dashboard.mjs', 'utf8');
  assert.match(sanitizer, /Arvato OTIF/);
  assert.match(sanitizer, /workbookBasenames/);
  assert.match(sanitizer, /synthetic-hr-dataset/);
  assert.match(sanitizer, /internal workbook filename/);
  assert.match(sanitizer, /public HR sanitization incomplete/);
});
