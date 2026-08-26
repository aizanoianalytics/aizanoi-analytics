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

test('all ten verified synthetic dashboards are public', () => {
  assert.equal(manifest.publicDashboardCount, 10);
  assert.equal(manifest.dashboards.filter(({ status }) => status === 'public').length, 10);
  assert.equal(manifest.pipeline.filter(({ status }) => status === 'public').length, 10);
  assert.match(catalog, /Eight working views/i);
  assert.match(catalog, /14-sheet synthetic workbook/i);
  assert.match(catalog, /20-sheet Synthetic HR Demo Core/i);
  assert.match(catalog, /10<\/strong><span>verified public builds/i);
  assert.match(catalog, /0<\/strong><span>employer records published/i);
});

test('nine shared-core dashboards expose full interactive surfaces', () => {
  const sharedIds = dashboardIds.filter((id) => id !== 'workforce-turnover');
  for (const id of sharedIds) {
    const file = `${publicRoot}/${id}/index.html`;
    assert.ok(existsSync(file), `${id} public route missing`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /id="filter-period"/);
    assert.match(html, /id="filter-region"/);
    assert.match(html, /id="filter-store"/);
    assert.match(html, /id="filter-department"/);
    assert.match(html, /id="search" type="search"/);
    assert.match(html, /Synthetic HR Demo Core/);
    assert.match(html, /"dataPolicy":"synthetic-only"/);
    assert.match(html, /shared\/dashboard\.js/);
    assert.match(html, /shared\/dashboard\.css/);
    assert.doesNotMatch(html, /ipekyol|erduran|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const payloadText = html.match(/<div id="dashboard-data" hidden>([\s\S]+?)<\/div><script src=/)?.[1];
    assert.ok(payloadText, `${id} payload missing`);
    const payload = JSON.parse(payloadText);
    assert.equal(payload.meta.id, id);
    assert.ok(payload.views.length >= 4, `${id} view inventory is too shallow`);
    for (const view of payload.views) assert.ok(payload.datasets[view.dataset]?.length > 0, `${id}/${view.id} has no data`);
  }
});

test('current executive surface contains no pre-2024 analytical periods', () => {
  const html = readFileSync(`${publicRoot}/hr-executive-board-current/index.html`, 'utf8');
  const payload = JSON.parse(html.match(/<div id="dashboard-data" hidden>([\s\S]+?)<\/div><script src=/)[1]);
  const datedPeriods = Object.values(payload.datasets).flat().map((row) => row.period).filter((period) => period && period !== 'Current');
  assert.ok(datedPeriods.length > 0);
  assert.ok(datedPeriods.every((period) => String(period) >= '2024'));
});

test('shared core generator and committed workbook preserve the reproducible contract', () => {
  const generator = readFileSync(`${sourceRoot}/synthetic-core/generate_hr_demo_core.mjs`, 'utf8');
  const webGenerator = readFileSync(`${sourceRoot}/generate_full_set_dashboards.py`, 'utf8');
  const workbook = `${sourceRoot}/synthetic-core/data/hr_demo_core_synthetic.xlsx`;
  assert.ok(existsSync(workbook));
  assert.ok(readFileSync(workbook).byteLength > 2_000_000);
  assert.match(generator, /20260826/);
  assert.match(generator, /@oai\/artifact-tool/);
  for (const sheet of ['Employees', 'Employment_Monthly', 'Exits', 'Hiring', 'Promotions', 'Performance', 'Learning_Events', 'Compliance', 'Goals', 'Attendance', 'Turnover_Analysis', 'QA_Control']) assert.match(generator, new RegExp(sheet));
  assert.match(webGenerator, /Synthetic HR Demo Core/);
  assert.doesNotMatch(`${generator}\n${webGenerator}`, /ipekyol|erduran|@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('shared web engine keeps filtering, sorting, profiles and exports', () => {
  const engine = readFileSync(`${publicRoot}/shared/dashboard.js`, 'utf8');
  assert.match(engine, /function filtered/);
  assert.match(engine, /data-sort/);
  assert.match(engine, /function renderProfile/);
  assert.match(engine, /Export filtered CSV/);
  assert.match(engine, /URL\.createObjectURL/);
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
