import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const prohibitedEntities = [
  { label:'Arvato vendor identifier', pattern:/\bArvato\b/i },
];

const prohibitedSourceMetadata = [
  { label:'workbook filename', pattern:/\b[^\s<>"'`]+\.xlsx\b/i },
  { label:'source_file workbook metadata', pattern:/"source_file"\s*:\s*"[^"]*\.xlsx"/i },
  { label:'source workbook metadata', pattern:/"(?:source|fiili_source)"\s*:\s*"[^"]*\.xlsx"/i },
];

test('public generated HR dashboards contain no prohibited vendor identifiers or internal workbook filenames', () => {
  for (const file of publicDashboards) {
    const html = readFileSync(file, 'utf8');
    for (const rule of [...prohibitedEntities, ...prohibitedSourceMetadata]) {
      assert.doesNotMatch(html, rule.pattern, `${file} exposes ${rule.label}`);
    }
  }
});

test('HR public sanitization boundary declares the prohibited entity and workbook classes it removes', () => {
  const sanitizer = readFileSync('scripts/hr/sanitize-public-dashboard.mjs', 'utf8');
  assert.match(sanitizer, /Arvato OTIF/);
  assert.match(sanitizer, /synthetic-hr-dataset/);
  assert.match(sanitizer, /internal workbook filename/);
  assert.match(sanitizer, /public HR sanitization incomplete/);
});
