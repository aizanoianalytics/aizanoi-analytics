import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateDashboardHtml } from '../scripts/hr/decorate-public-dashboard.mjs';

const fixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="description" content="stale description">
  <link rel="canonical" href="https://example.invalid/stale">
  <title>Original dashboard title</title>
</head>
<body>
  <main><button id="native-control">Native control</button><a href="#native">Native link</a></main>
</body>
</html>`;

test('HR public dashboard decoration is deterministic and catalog-backed', () => {
  const first = decorateDashboardHtml(fixture, 'workforce-turnover');
  const second = decorateDashboardHtml(first, 'workforce-turnover');

  assert.equal(second, first, 'decorator must be idempotent');
  assert.match(first, /<html lang="tr">/i);
  assert.match(first, /<title>Workforce Turnover Analytics — Aizanoi Analytics<\/title>/);
  assert.match(first, /<meta name="description" content="Overview, comparison, forecast, early turnover, exit explorer, survival and risk, settings and exports\.">/);
  assert.match(first, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/analytics\/dashboards\/hr-analytics-full-set\/workforce-turnover\/">/);
  assert.match(first, /<meta property="og:title" content="Workforce Turnover Analytics — Aizanoi Analytics">/);
  assert.match(first, /<meta property="og:description"/);
  assert.match(first, /<meta property="og:url" content="https:\/\/aizanoianalytics\.com\/analytics\/dashboards\/hr-analytics-full-set\/workforce-turnover\/">/);
  assert.match(first, /Aizanoi Analytics · HR Analytics Full Set/);
  assert.match(first, /Back to Analytics/);
  assert.match(first, /Interface language: Turkish/);
  assert.match(first, /id="native-control"/);
  assert.match(first, />Native link<\/a>/);
  assert.equal((first.match(/AIZANOI_PUBLIC_META_START/g) || []).length, 1);
  assert.equal((first.match(/AIZANOI_PUBLIC_BAR_START/g) || []).length, 1);
  assert.equal((first.match(/target="_top"/g) || []).length, 2);
  assert.equal((first.match(/name="description"/g) || []).length, 1);
  assert.equal((first.match(/rel="canonical"/g) || []).length, 1);
});

test('HR public dashboard decoration rejects unknown routes and incomplete documents', () => {
  assert.throws(() => decorateDashboardHtml(fixture, 'not-a-dashboard'), /Unknown public HR dashboard id/);
  assert.throws(() => decorateDashboardHtml('<main>partial</main>', 'workforce-turnover'), /complete html\/head\/body document shell/);
});
