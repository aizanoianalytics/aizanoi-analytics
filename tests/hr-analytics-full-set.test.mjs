import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const sourceRoot = 'analytics/dashboards/hr-analytics-full-set';
const publicRoot = 'frontend/analytics/dashboards/hr-analytics-full-set';
const manifest = JSON.parse(readFileSync(`${sourceRoot}/pipeline-manifest.json`, 'utf8'));
const catalog = readFileSync(`${publicRoot}/index.html`, 'utf8');

const dashboardIds = [
  'hr-executive-board-full-history', 'hr-executive-board-current', 'hr-administration-deep-dive',
  'store-operations-tracking', 'workforce-turnover', 'store-learning-compliance',
  'learning-academy-analytics', 'performance-hiring-turnover', 'corporate-goals',
  'workforce-time-attendance',
];

test('catalog and source expose the complete ten-dashboard product map', () => {
  assert.equal(manifest.dashboardCount, 10);
  assert.equal(manifest.dashboards.length, 10);
  assert.equal(manifest.pipeline.length, 10);
  assert.deepEqual(manifest.dashboards.map(({ id }) => id), dashboardIds);
  for (const dashboard of manifest.dashboards) {
    const publicName = dashboard.name.replaceAll('&', '&amp;');
    assert.match(catalog, new RegExp(publicName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(existsSync(`${sourceRoot}/${dashboard.id}/README.md`), `${dashboard.id} source folder missing`);
    assert.ok(dashboard.capabilities.length >= 4, `${dashboard.id} capability inventory is too shallow`);
  }
});

test('only the verified synthetic dashboard is public', () => {
  assert.equal(manifest.publicDashboardCount, 1);
  assert.deepEqual(manifest.dashboards.filter(({ status }) => status === 'public').map(({ id }) => id), ['workforce-turnover']);
  assert.equal(manifest.dashboards.filter(({ status }) => status === 'synthetic-rebuild-pending').length, 9);
  assert.match(catalog, /Eight working views/i);
  assert.match(catalog, /14-sheet synthetic workbook/i);
  assert.match(catalog, /0<\/strong><span>employer records published/i);
});

test('public catalog describes the pipeline without private artifacts or identities', () => {
  const readme = readFileSync(`${sourceRoot}/README.md`, 'utf8');
  const combined = `${catalog}\n${readme}\n${JSON.stringify(manifest)}`;
  assert.doesNotMatch(combined, /ipekyol|erduran/i);
  assert.doesNotMatch(combined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(combined, /\.html|\.xlsx/i);
  assert.match(combined, /Synthetic HR Demo Core/i);
  assert.match(combined, /Reference workbooks and exported HTML are not part/i);
});

test('legacy turnover route points to the new Full Set location', () => {
  const legacy = readFileSync('frontend/analytics/workforce-turnover/index.html', 'utf8');
  const route = '/analytics/dashboards/hr-analytics-full-set/workforce-turnover/';
  assert.match(legacy, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(legacy, /noindex,follow/);
});
